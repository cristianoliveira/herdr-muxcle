import assert from "node:assert/strict";
import test from "node:test";
import { observeRecentTabs } from "../../.build/mods/muxcle-history/model.js";
import {
  closeTargetIsCurrent,
  hasVisibleHistoryBlock,
  parseConnectedPeers,
  parsePickerConfig,
  parsePickerOrder,
  pickerManagementActions,
  pickerRows,
  selectedRowKey,
  selectionAction,
} from "../../.build/mods/muxcle-picker/model.js";

const spaces = [
  {
    id: "local",
    name: "dotfiles",
    machine: null,
    active: true,
    tabs: [
      { id: "terminal", name: "crew", active: true },
      { id: "editor", name: "editor", active: false },
    ],
  },
  {
    id: "server:project",
    name: "project",
    machine: "server",
    active: false,
    tabs: [{ id: "server:terminal", name: "logs", active: true }],
  },
  { id: "quiet", name: "empty space", machine: null, active: false, tabs: [] },
];

const agentMetadata = [
  {
    space: "local",
    tab: "editor",
    app: "claude-code",
    program: { name: "Claude Code", agent: true },
    title: "deploy the release",
  },
  {
    space: "server:project",
    tab: "server:terminal",
    app: "codex",
    program: { name: "Codex", agent: true },
  },
];

test("shows all tabs and empty spaces in native order without hiding quiet work", () => {
  const rows = pickerRows(spaces, "");

  assert.deepEqual(
    rows.map(({ label }) => label),
    ["dotfiles → crew", "dotfiles → editor", "project → logs", "empty space"],
  );
  assert.equal(rows[0].active, true);
  assert.equal(rows[2].active, false);
  assert.equal(new Set(rows.map(({ key }) => key)).size, 4);
  assert.equal(rows[2].machine, "server");
});

test("matches compact fuzzy characters across names, ignoring case and whitespace", () => {
  assert.deepEqual(
    pickerRows(spaces, " DOT crew ").map(({ id }) => id),
    ["terminal"],
  );
  assert.deepEqual(
    pickerRows(spaces, "prjlg").map(({ id }) => id),
    ["server:terminal"],
  );
  assert.deepEqual(pickerRows(spaces, "absent"), []);
  assert.deepEqual(pickerRows([], ""), []);
});

test("selection follows stable identity through renames and invalidates a removed target", () => {
  const rows = pickerRows(spaces, "");
  const renamed = [{ ...spaces[0], name: "renamed" }, ...spaces.slice(1)];

  assert.equal(selectedRowKey(rows, null), rows[0].key);
  assert.equal(selectedRowKey(pickerRows(renamed, ""), rows[1].key), rows[1].key);
  assert.equal(selectedRowKey(rows.slice(2), rows[1].key), null);
  assert.equal(selectedRowKey(rows.slice(2), null), rows[2].key);
  assert.equal(selectedRowKey(rows.slice(2), null, true), null);
  assert.equal(selectedRowKey([], rows[0].key), null);
});

test("selects existing tabs or empty spaces with qualified IDs, without creation", () => {
  const rows = pickerRows(spaces, "");

  assert.deepEqual(selectionAction(spaces, "", rows[2].key), {
    command: "tab.select",
    args: { id: "server:terminal" },
  });
  assert.deepEqual(selectionAction(spaces, "", rows[3].key), {
    command: "space.select",
    args: { id: "quiet" },
  });
});

test("does not dispatch stale, filtered, or cross-space row identities", () => {
  const [row] = pickerRows(spaces, "");
  const replaced = [{ ...spaces[0], tabs: [] }, ...spaces.slice(1)];
  const moved = [{ ...spaces[0], id: "different-space" }, ...spaces.slice(1)];

  assert.equal(selectionAction(replaced, "", row.key), null);
  assert.equal(selectionAction(spaces, "editor", row.key), null);
  assert.equal(selectionAction(moved, "", row.key), null);
  assert.equal(selectionAction(spaces, "", "unknown"), null);
});

test("native order stays the default even when valid MRU data exists", () => {
  const recent = { schema: 1, visits: [{ space: "server:project", tab: "server:terminal" }] };

  assert.deepEqual(pickerRows(spaces, "", { order: "native", recentState: recent }), pickerRows(spaces, ""));
});

test("explicit recent order ranks visited tabs and spaces, then preserves unvisited native order", () => {
  let recent = observeRecentTabs(null, [
    {
      id: "local",
      active: true,
      tabs: [
        { id: "terminal", active: true },
        { id: "editor", active: false },
      ],
    },
    { id: "server:project", active: false, tabs: [{ id: "server:terminal", active: false }] },
  ]);
  recent = observeRecentTabs(recent, [
    {
      id: "local",
      active: false,
      tabs: [
        { id: "terminal", active: false },
        { id: "editor", active: false },
      ],
    },
    { id: "server:project", active: true, tabs: [{ id: "server:terminal", active: true }] },
  ]);
  const before = structuredClone(spaces);
  const rows = pickerRows(spaces, "", {
    agents: agentMetadata,
    order: "recent",
    recentState: recent,
    historyBlockVisible: true,
  });

  assert.deepEqual(
    rows.map(({ label }) => label),
    ["project → logs", "dotfiles → crew", "dotfiles → editor", "empty space"],
  );
  assert.deepEqual(spaces, before);
  assert.equal(selectedRowKey(rows, null), rows.find((row) => row.active)?.key);
  assert.deepEqual(pickerRows(spaces, "", { order: "native", recentState: recent }), pickerRows(spaces, ""));
});

test("missing observer data falls back to native order and stale visits cannot rank targets", () => {
  assert.deepEqual(pickerRows(spaces, "", { order: "recent", historyBlockVisible: true }), pickerRows(spaces, ""));
  assert.deepEqual(
    pickerRows(spaces, "", {
      order: "recent",
      recentState: { schema: 2, visits: [{ space: "local", tab: "terminal" }] },
      historyBlockVisible: true,
    }),
    pickerRows(spaces, ""),
  );
  assert.deepEqual(
    pickerRows(spaces, "", {
      order: "recent",
      recentState: { schema: 1, visits: [{ space: "gone", tab: "closed" }] },
      historyBlockVisible: true,
    }),
    pickerRows(spaces, ""),
  );
});

test("only visible History blocks in the active layout count as providers", () => {
  const historyBlock = { id: "history", type: "block", content: { mod: "muxcle-history" } };
  const hiddenHistory = { ...historyBlock, hidden: true };

  assert.equal(
    hasVisibleHistoryBlock({
      id: "root",
      type: "row",
      children: [{ id: "nested", type: "column", children: [historyBlock] }],
    }),
    true,
  );
  assert.equal(
    hasVisibleHistoryBlock({
      id: "root",
      type: "stack",
      active: "other",
      children: [historyBlock, { id: "other", type: "block", content: { mod: "other" } }],
    }),
    false,
  );
  assert.equal(
    hasVisibleHistoryBlock({
      id: "root",
      type: "stack",
      active: "history",
      children: [historyBlock, { id: "other", type: "block", content: { mod: "other" } }],
    }),
    true,
  );
  assert.equal(hasVisibleHistoryBlock({ id: "root", type: "row", children: [hiddenHistory] }), false);
  assert.equal(
    hasVisibleHistoryBlock({
      id: "root",
      type: "block",
      content: { mod: "ordinary", props: { mod: "muxcle-history" } },
      props: { mod: "muxcle-history" },
    }),
    false,
  );
  assert.equal(
    hasVisibleHistoryBlock({
      id: "root",
      type: "block",
      content: { mod: "ordinary" },
      floating: [{ id: "history-float", hidden: false, content: { mod: "muxcle-history" } }],
    }),
    true,
  );
  assert.equal(hasVisibleHistoryBlock({ type: "row", children: "not-a-tree" }), false);
});

test("valid cached MRU stays native when no visible History provider is in the layout", () => {
  const recent = { schema: 1, visits: [{ space: "server:project", tab: "server:terminal" }] };
  const layoutWithoutHistory = { id: "root", type: "row", children: [] };

  assert.equal(hasVisibleHistoryBlock(layoutWithoutHistory), false);
  assert.deepEqual(
    pickerRows(spaces, "", {
      order: "recent",
      recentState: recent,
      historyBlockVisible: hasVisibleHistoryBlock(layoutWithoutHistory),
    }),
    pickerRows(spaces, ""),
  );
  assert.deepEqual(recent.visits, [{ space: "server:project", tab: "server:terminal" }]);
});

test("unmount, remount, and restart-like layout changes gate persisted MRU without erasing it", () => {
  const recent = { schema: 1, visits: [{ space: "server:project", tab: "server:terminal" }] };
  const historyBlock = { id: "history", type: "block", content: { mod: "muxcle-history" } };
  const mountedLayout = { id: "root", type: "row", children: [historyBlock] };
  const unmountedLayout = { id: "root", type: "row", children: [] };
  const rowsFor = (currentLayout) =>
    pickerRows(spaces, "", {
      order: "recent",
      recentState: recent,
      historyBlockVisible: hasVisibleHistoryBlock(currentLayout),
    });

  assert.equal(rowsFor(mountedLayout)[0].label, "project → logs");
  assert.deepEqual(rowsFor(unmountedLayout), pickerRows(spaces, ""));
  assert.equal(rowsFor(mountedLayout)[0].label, "project → logs");
  assert.deepEqual(rowsFor(unmountedLayout), pickerRows(spaces, ""));
  assert.deepEqual(recent.visits, [{ space: "server:project", tab: "server:terminal" }]);
});

test("layout provider detection fails closed on oversized or excessively deep trees", () => {
  const wideLayout = {
    id: "root",
    type: "row",
    children: Array.from({ length: 2050 }, (_, index) => ({
      id: `child-${index}`,
      type: "block",
      content: { mod: index === 2049 ? "muxcle-history" : "other" },
    })),
  };
  let deepLayout = { id: "history", type: "block", content: { mod: "muxcle-history" } };
  for (let depth = 0; depth < 70; depth += 1) {
    deepLayout = { id: `container-${depth}`, type: "row", children: [deepLayout] };
  }

  assert.equal(hasVisibleHistoryBlock(wideLayout), false);
  assert.equal(hasVisibleHistoryBlock(deepLayout), false);
});

test("searches machine names and the stable local alias without changing native order", () => {
  assert.deepEqual(
    pickerRows(spaces, "server", { agents: agentMetadata }).map(({ label }) => label),
    ["project → logs"],
  );
  assert.deepEqual(
    pickerRows(spaces, "server project", { agents: agentMetadata }).map(({ label }) => label),
    ["project → logs"],
  );
  assert.deepEqual(
    pickerRows(spaces, "local dotfiles", { agents: agentMetadata }).map(({ label }) => label),
    ["dotfiles → crew", "dotfiles → editor"],
  );
  assert.deepEqual(
    pickerRows(spaces, "local", { agents: agentMetadata }).map(({ label }) => label),
    ["dotfiles → crew", "dotfiles → editor", "empty space"],
  );
  assert.deepEqual(
    pickerRows(spaces, "", { agents: agentMetadata }).map(({ label }) => label),
    pickerRows(spaces, "").map(({ label }) => label),
  );
});

test("searches agent program names and reported app names by exact space and tab IDs", () => {
  assert.deepEqual(
    pickerRows(spaces, "claude", { agents: agentMetadata }).map(({ label }) => label),
    ["dotfiles → editor"],
  );
  assert.deepEqual(
    pickerRows(spaces, "codex", { agents: agentMetadata }).map(({ label }) => label),
    ["project → logs"],
  );
  assert.deepEqual(
    pickerRows(spaces, "localdotfileseditorclaude", { agents: agentMetadata }).map(({ label }) => label),
    ["dotfiles → editor"],
  );
  assert.deepEqual(pickerRows(spaces, "deploy", { agents: agentMetadata }), []);
});

test("duplicate local and remote labels keep machine-scoped identities and agent associations", () => {
  const duplicates = [
    {
      id: "space",
      name: "shared",
      machine: null,
      active: true,
      tabs: [{ id: "tab", name: "work", active: true }],
    },
    {
      id: "cloud/space",
      name: "shared",
      machine: "cloud",
      active: false,
      tabs: [{ id: "cloud/tab", name: "work", active: true }],
    },
  ];
  const agents = [
    { space: "space", tab: "tab", app: "pi", program: { name: "Pi", agent: true } },
    {
      space: "cloud/space",
      tab: "cloud/tab",
      app: "claude-code",
      program: { name: "Claude Code", agent: true },
    },
  ];
  const allRows = pickerRows(duplicates, "", { agents });
  const remoteRows = pickerRows(duplicates, "claude", { agents });

  assert.equal(allRows.length, 2);
  assert.notEqual(allRows[0].key, allRows[1].key);
  assert.deepEqual(
    remoteRows.map(({ key }) => key),
    [allRows[1].key],
  );
  assert.deepEqual(selectionAction(duplicates, "claude", allRows[1].key, { agents }), {
    command: "tab.select",
    args: { id: "cloud/tab" },
  });
});

test("disconnected remote targets keep their qualified selection and never fall back to a local twin", () => {
  const duplicates = [
    {
      id: "local-space",
      name: "shared",
      machine: null,
      active: true,
      tabs: [{ id: "local-tab", name: "work", active: true }],
    },
    {
      id: "offline/space",
      name: "shared",
      machine: "offline",
      active: false,
      tabs: [{ id: "offline/tab", name: "work", active: true }],
    },
  ];
  const staleAgents = [
    { space: "removed/space", tab: "removed/tab", app: "ghost", program: { name: "Ghost" } },
    { space: "offline/space", tab: "offline/tab", app: null },
  ];

  assert.deepEqual(pickerRows(spaces, "claude", { agents: [] }), []);
  assert.deepEqual(
    pickerRows(spaces, "server", { agents: [] }).map(({ id }) => id),
    ["server:terminal"],
  );
  const offlineRows = pickerRows(duplicates, "shared", { agents: staleAgents });
  const offlineKey = offlineRows[1].key;
  assert.deepEqual(selectionAction(duplicates, "shared", offlineKey, { agents: [] }), {
    command: "tab.select",
    args: { id: "offline/tab" },
  });
  const localTwinRows = pickerRows(duplicates.slice(0, 1), "shared", { agents: staleAgents });
  assert.equal(selectedRowKey(localTwinRows, offlineKey), null);
  assert.equal(selectionAction(duplicates.slice(0, 1), "shared", offlineKey, { agents: staleAgents }), null);
  assert.deepEqual(pickerRows(duplicates, "ghost", { agents: staleAgents }), []);
});

test("agent-only selection is revalidated when the associated agent disappears", () => {
  const rows = pickerRows(spaces, "claude", { agents: agentMetadata });
  assert.equal(rows.length, 1);
  assert.equal(selectionAction(spaces, "claude", rows[0].key, { agents: [] }), null);
});

test("malformed agent metadata and oversized names cannot break search", () => {
  assert.deepEqual(pickerRows(spaces, "claude", { agents: 1 }), []);
  assert.deepEqual(
    pickerRows(spaces, "ghost", {
      agents: [
        {
          space: "local",
          tab: "editor",
          app: null,
          program: { name: `${"x".repeat(512)}ghost` },
        },
      ],
    }),
    [],
  );
});

test("picker config keeps every opt-in independent and fails closed", () => {
  const disabled = { order: "native", agentContext: false, management: false, remoteSpaces: false };
  assert.deepEqual(parsePickerConfig(null), disabled);
  assert.deepEqual(parsePickerConfig("not json"), disabled);
  assert.deepEqual(parsePickerConfig(" ".repeat(4097)), disabled);
  assert.deepEqual(parsePickerConfig('{"schema":2,"order":"recent","agentContext":true}'), disabled);
  assert.deepEqual(parsePickerConfig('{"schema":1,"order":"recent"}'), {
    order: "recent",
    agentContext: false,
    management: false,
    remoteSpaces: false,
  });
  assert.deepEqual(parsePickerConfig('{"schema":1,"agentContext":true}'), {
    order: "native",
    agentContext: true,
    management: false,
    remoteSpaces: false,
  });
  assert.deepEqual(parsePickerConfig('{"schema":1,"order":"recent","agentContext":"yes"}'), {
    order: "recent",
    agentContext: false,
    management: false,
    remoteSpaces: false,
  });
  assert.deepEqual(parsePickerConfig('{"schema":1,"order":"other","agentContext":true}'), disabled);
  assert.deepEqual(parsePickerConfig('{"schema":1,"management":true,"remoteSpaces":true}'), {
    order: "native",
    agentContext: false,
    management: true,
    remoteSpaces: true,
  });
  assert.deepEqual(parsePickerConfig('{"schema":1,"management":false,"remoteSpaces":true}'), disabled);
  assert.deepEqual(parsePickerConfig('{"schema":1,"management":true,"remoteSpaces":"yes"}'), {
    order: "native",
    agentContext: false,
    management: true,
    remoteSpaces: false,
  });
  assert.equal(parsePickerOrder('{"schema":1,"order":"recent"}'), "recent");
});

test("connected peer parsing requires unique native identities and preserves temporary metadata for rejection", () => {
  assert.deepEqual(
    parseConnectedPeers(
      JSON.stringify({
        machines: [
          { id: "peer-server", name: "server", state: "connected", temporary: true },
          { id: "peer-sleeping", name: "sleeping", state: "disconnected" },
        ],
      }),
    ),
    [{ id: "peer-server", name: "server", state: "connected", temporary: true }],
  );
  assert.deepEqual(parseConnectedPeers('{"machines":[]}'), []);
  for (const invalid of [
    null,
    "not json",
    "{}",
    '{"machines":[null]}',
    '{"machines":[{"name":"server","state":"connected"}]}',
    '{"machines":[{"id":"","name":"server","state":"connected"}]}',
    '{"machines":[{"id":"peer-a","name":"server","state":"connected"},{"id":"peer-b","name":"server","state":"connected"}]}',
    '{"machines":[{"id":"peer-a","name":"server","state":"connected"},{"id":"peer-a","name":"other","state":"connected"}]}',
    '{"machines":[{"id":"peer-a","name":"server","state":"connected","temporary":"yes"}]}',
  ]) {
    assert.equal(parseConnectedPeers(invalid), null);
  }
});

test("temporary connected peers stay parsed but never become remote mutation targets", () => {
  const remoteSpaces = [
    {
      ...spaces[1],
      active: true,
      tabs: [{ id: "server:terminal", name: "logs", active: true, panes: 1 }],
    },
  ];
  const peers = [
    { id: "peer-server", name: "server", state: "connected", temporary: true },
    { id: "peer-build", name: "build", state: "connected" },
  ];
  const rows = pickerRows(remoteSpaces, "");
  const panes = [{ pane: "remote-pane", tab: "server:terminal", terminal: "remote-terminal", mod: null }];
  const actions = pickerManagementActions(remoteSpaces, {
    enabled: true,
    remoteSpaces: true,
    connectedPeers: peers,
    focused: { space: "server:project", tab: "server:terminal", pane: null, terminal: null, shown: null },
    selectedKey: rows[0].key,
    panes,
  });

  assert.deepEqual(
    actions.map(({ kind }) => kind),
    ["new-local-space", "new-peer-space"],
  );
  assert.equal(actions[1].machine, "build");
  assert.equal(
    closeTargetIsCurrent(
      {
        spaceId: "server:project",
        spaceName: "project",
        machine: "server",
        peerId: "peer-server",
        tabId: "server:terminal",
        tabName: "logs",
        panes: [{ pane: "remote-pane", terminal: "remote-terminal", mod: null }],
        focusedPane: null,
      },
      remoteSpaces,
      panes,
      null,
      peers,
    ),
    false,
  );
});

test("management actions are separate, opt-in, and tied to exact focused and selected identities", () => {
  const managedSpaces = [
    { ...spaces[0], active: true, tabs: [{ id: "terminal", name: "crew", active: true, panes: 2 }] },
    { ...spaces[1], active: true, tabs: [{ id: "server:terminal", name: "logs", active: true, panes: 1 }] },
  ];
  const panes = [
    { pane: "p2", tab: "terminal", terminal: "t2", mod: null },
    { pane: "p1", tab: "terminal", terminal: "t1", mod: null },
    { pane: "remote-pane", tab: "server:terminal", terminal: "remote-terminal", mod: null },
  ];
  const rows = pickerRows(managedSpaces, "");
  const options = {
    enabled: true,
    remoteSpaces: true,
    connectedPeers: [{ id: "peer-server", name: "server", state: "connected" }],
    focused: { space: "local", tab: "terminal", pane: "p1", terminal: "t1", shown: null },
    selectedKey: rows[0].key,
    panes,
  };
  const actions = pickerManagementActions(managedSpaces, options);

  assert.deepEqual(
    actions.map(({ kind }) => kind),
    ["new-tab", "new-local-space", "new-peer-space", "close-tab"],
  );
  assert.equal(actions[0].spaceId, "local");
  assert.deepEqual(actions[0].machine, null);
  assert.equal(actions[0].peerId, null);
  assert.equal(actions[2].machine, "server");
  assert.equal(actions[2].peerId, "peer-server");
  assert.equal(actions[3].target.peerId, null);
  assert.deepEqual(actions[3].target.panes, [
    { pane: "p1", terminal: "t1", mod: null },
    { pane: "p2", terminal: "t2", mod: null },
  ]);
  assert.equal(
    new Set([...rows.map((row) => row.key), ...actions.map((action) => action.key)]).size,
    rows.length + actions.length,
  );
  assert.deepEqual(pickerManagementActions(managedSpaces, { ...options, enabled: false }), []);
  assert.deepEqual(
    pickerManagementActions(managedSpaces, {
      ...options,
      remoteSpaces: false,
      connectedPeers: null,
    }).map(({ kind }) => kind),
    ["new-tab", "new-local-space", "close-tab"],
  );
  assert.deepEqual(
    pickerManagementActions(managedSpaces, {
      ...options,
      focused: {
        space: "server:project",
        tab: "server:terminal",
        pane: "remote-pane",
        terminal: "remote-terminal",
        shown: null,
      },
      connectedPeers: [],
    }).map(({ kind }) => kind),
    ["new-local-space", "close-tab"],
  );
});

test("remote close review captures and rechecks the exact native peer identity", () => {
  const remoteSpaces = [
    {
      id: "server/space",
      name: "Remote",
      machine: "server",
      active: true,
      tabs: [{ id: "server/tab", name: "Shell", active: true, panes: 1 }],
    },
  ];
  const connectedPeers = [{ id: "peer-original", name: "server", state: "connected" }];
  const panes = [{ pane: "server/pane", tab: "server/tab", terminal: "server/terminal", mod: null }];
  const selected = pickerRows(remoteSpaces, "")[0].key;
  const [close] = pickerManagementActions(remoteSpaces, {
    enabled: true,
    remoteSpaces: true,
    connectedPeers,
    focused: null,
    selectedKey: selected,
    panes,
  }).filter((action) => action.kind === "close-tab");

  assert.ok(close);
  assert.equal(close.target.peerId, "peer-original");
  assert.equal(closeTargetIsCurrent(close.target, remoteSpaces, panes, null, connectedPeers), true);
  assert.equal(
    closeTargetIsCurrent(close.target, remoteSpaces, panes, null, [
      { id: "peer-rebound", name: "server", state: "connected" },
    ]),
    false,
  );
  assert.equal(closeTargetIsCurrent(close.target, remoteSpaces, panes, null, []), false);
});

test("tab close review requires a complete stable pane and resource snapshot", () => {
  const managedSpaces = [{ ...spaces[0], tabs: [{ id: "terminal", name: "crew", active: true, panes: 2 }] }];
  const panes = [
    { pane: "p1", tab: "terminal", terminal: "t1", mod: null },
    { pane: "p2", tab: "terminal", terminal: null, mod: "files" },
  ];
  const selected = pickerRows(managedSpaces, "")[0].key;
  const [close] = pickerManagementActions(managedSpaces, {
    enabled: true,
    remoteSpaces: false,
    connectedPeers: null,
    focused: null,
    selectedKey: selected,
    panes,
  }).filter((action) => action.kind === "close-tab");
  assert.ok(close);
  assert.equal(closeTargetIsCurrent(close.target, managedSpaces, panes, null), true);
  assert.equal(closeTargetIsCurrent(close.target, [{ ...managedSpaces[0], machine: "other" }], panes, null), false);
  assert.equal(
    closeTargetIsCurrent(close.target, managedSpaces, [{ ...panes[0], terminal: "replacement" }, panes[1]], null),
    false,
  );
  const focused = { space: "local", tab: "terminal", pane: "p1", terminal: "t1", shown: "shown-terminal" };
  const [focusedClose] = pickerManagementActions(managedSpaces, {
    enabled: true,
    remoteSpaces: false,
    connectedPeers: null,
    focused,
    selectedKey: selected,
    panes,
  }).filter((action) => action.kind === "close-tab");
  assert.equal(closeTargetIsCurrent(focusedClose.target, managedSpaces, panes, focused), true);
  assert.equal(
    closeTargetIsCurrent(focusedClose.target, managedSpaces, panes, {
      ...focused,
      shown: "replacement",
    }),
    false,
  );
  assert.equal(
    pickerManagementActions(managedSpaces, {
      enabled: true,
      remoteSpaces: false,
      connectedPeers: null,
      focused: null,
      selectedKey: selected,
      panes: [panes[0]],
    }).some((action) => action.kind === "close-tab"),
    false,
  );
});

test("optional row context uses exact IDs and counts unique live descendants, excluding agent roots", () => {
  const contextualSpaces = [
    {
      ...spaces[0],
      tabs: spaces[0].tabs.map((tab) => (tab.id === "editor" ? { ...tab, status: "blocked" } : tab)),
    },
    {
      id: "remote/project",
      name: "dotfiles",
      machine: "remote",
      active: false,
      tabs: [{ id: "remote/editor", name: "editor", active: false, status: "idle" }],
    },
  ];
  const contextualAgents = [
    {
      address: "local/root",
      space: "local",
      tab: "editor",
      status: "working",
      app: "claude-code",
      program: { name: "Claude Code", agent: true },
    },
    {
      address: "remote/root",
      space: "remote/project",
      tab: "remote/editor",
      app: "codex",
      program: { name: "Codex", agent: true },
    },
    {
      address: "wrong/root",
      space: "another/project",
      tab: "editor",
      app: "wrong-agent",
      program: { name: "Wrong Agent", agent: true },
    },
  ];
  const terminals = [
    { address: "local/root", parent: null, state: "live" },
    { address: "local/worker", parent: "local/root", state: "live" },
    { address: "local/worker", parent: "local/root", state: "live" },
    { address: "local/child", parent: "local/worker", state: "live" },
    { address: "local/closed", parent: "local/root", state: "exited" },
    { address: "remote/root", parent: null, state: "live" },
    { address: "remote/worker", parent: "remote/root", state: "live" },
  ];
  const plainRows = pickerRows(contextualSpaces, "", { agents: contextualAgents });
  const contextRows = pickerRows(contextualSpaces, "", {
    agents: contextualAgents,
    agentContext: true,
    terminals,
  });
  const localEditor = contextRows.find((row) => row.id === "editor");
  const remoteEditor = contextRows.find((row) => row.id === "remote/editor");

  assert.equal("context" in plainRows.find((row) => row.id === "editor"), false);
  assert.deepEqual(
    contextRows.map(({ key, label }) => [key, label]),
    plainRows.map(({ key, label }) => [key, label]),
  );
  assert.deepEqual(localEditor.context, {
    status: "blocked",
    programs: ["Claude Code"],
    programsTruncated: false,
    descendants: { kind: "exact", count: 2 },
  });
  assert.deepEqual(remoteEditor.context, {
    status: "idle",
    programs: ["Codex"],
    programsTruncated: false,
    descendants: { kind: "exact", count: 1 },
  });
  assert.deepEqual(
    pickerRows(contextualSpaces, "claude", { agents: contextualAgents, agentContext: true, terminals }).map(
      ({ id }) => id,
    ),
    ["editor"],
  );
  const recentOptions = {
    agents: contextualAgents,
    order: "recent",
    recentState: { schema: 1, visits: [{ space: "remote/project", tab: "remote/editor" }] },
    historyBlockVisible: true,
  };
  assert.deepEqual(
    pickerRows(contextualSpaces, "", { ...recentOptions, agentContext: true, terminals }).map(({ key }) => key),
    pickerRows(contextualSpaces, "", recentOptions).map(({ key }) => key),
  );
});

test("context reports unavailable or lower-bound descendants for missing and conflicting metadata", () => {
  const target = spaces[0].tabs[0];
  const targetSpaces = [{ ...spaces[0], tabs: [{ ...target, status: null }] }];
  const rootAgent = {
    address: "local/root",
    space: "local",
    tab: "terminal",
    status: "working",
    app: "pi",
    program: { name: "Pi", agent: true },
  };
  const rowsFor = (agents, terminals) =>
    pickerRows(targetSpaces, "", { agents, agentContext: true, terminals })[0].context;

  assert.deepEqual(rowsFor([rootAgent], null).descendants, { kind: "unavailable" });
  assert.deepEqual(rowsFor([{ ...rootAgent, address: null }], []), {
    status: "working",
    programs: ["Pi"],
    programsTruncated: false,
    descendants: { kind: "unavailable" },
  });
  assert.deepEqual(
    rowsFor(
      [rootAgent],
      [
        { address: "local/root", parent: null, state: "live" },
        { address: "local/child", parent: "orphan/parent", state: "live" },
      ],
    ).descendants,
    { kind: "lower-bound", count: 0 },
  );
  assert.deepEqual(
    rowsFor(
      [rootAgent],
      [
        { address: "local/root", parent: null, state: "live" },
        { address: "local/child", parent: "local/root", state: "live" },
        { address: "local/child", parent: "other/root", state: "live" },
      ],
    ).descendants,
    { kind: "lower-bound", count: 0 },
  );
  const conflictedAgent = rowsFor(
    [rootAgent, { ...rootAgent, program: { name: "Different", agent: true } }],
    [{ address: "local/root", parent: null, state: "live" }],
  );
  assert.deepEqual(conflictedAgent.programs, []);
  assert.deepEqual(conflictedAgent.descendants, { kind: "lower-bound", count: 0 });
});

test("conflicting or unknown agent roots cannot inflate descendant lower bounds", () => {
  const spacesFor = (ids) => [
    {
      id: "local/space",
      name: "Space",
      machine: null,
      active: true,
      tabs: ids.map((id) => ({ id, name: id, active: false })),
    },
  ];
  const row = (tabId, agents, terminals) =>
    pickerRows(spacesFor([tabId]), "", { agents, agentContext: true, terminals })[0].context;
  const agent = (address, space, tab, program, status = "working") => ({
    address,
    space,
    tab,
    status,
    app: program,
    program: { name: program, agent: true },
  });

  const nestedConflict = row(
    "local/tab",
    [
      agent("local/a", "local/space", "local/tab", "A"),
      agent("local/a", "local/space", "local/tab", "conflicting A", "blocked"),
      agent("local/b", "local/space", "local/tab", "B"),
    ],
    [
      { address: "local/b", parent: null, state: "live" },
      { address: "local/a", parent: "local/b", state: "live" },
    ],
  );
  assert.deepEqual(nestedConflict.descendants, { kind: "lower-bound", count: 0 });

  const unknownRoot = row(
    "local/tab",
    [agent("local/b", "local/space", "local/tab", "B"), agent(null, "local/space", "local/tab", "Unknown")],
    [
      { address: "local/b", parent: null, state: "live" },
      { address: "local/unknown", parent: "local/b", state: "live" },
    ],
  );
  assert.deepEqual(unknownRoot.descendants, { kind: "unavailable" });

  const conflictingTargetRows = pickerRows([...spacesFor(["local/first", "local/second"])], "", {
    agents: [
      agent("local/a", "local/space", "local/first", "A"),
      agent("local/a", "local/space", "local/second", "A elsewhere"),
      agent("local/b", "local/space", "local/second", "B"),
    ],
    agentContext: true,
    terminals: [
      { address: "local/b", parent: null, state: "live" },
      { address: "local/a", parent: "local/b", state: "live" },
    ],
  });
  assert.deepEqual(conflictingTargetRows[1].context.descendants, { kind: "unavailable" });

  const ambiguousRootRows = pickerRows(spacesFor(["local/first", "local/second"]), "", {
    agents: [
      agent("local/a", "local/space", "local/first", "A"),
      agent("local/a", "local/space", "local/second", "A elsewhere"),
      agent("local/b", "local/space", "local/second", "B"),
    ],
    agentContext: true,
    terminals: [
      { address: "local/a", parent: null, state: "live" },
      { address: "local/child", parent: "local/a", state: "live" },
      { address: "local/b", parent: null, state: "live" },
    ],
  });
  assert.deepEqual(ambiguousRootRows[0].context.descendants, { kind: "unavailable" });
  assert.deepEqual(ambiguousRootRows[1].context.descendants, { kind: "unavailable" });
});

test("context deduplicates identical agents and avoids cycles and unbounded descendant walks", () => {
  const targetSpaces = [
    {
      ...spaces[0],
      tabs: [{ ...spaces[0].tabs[0], status: "working" }],
    },
  ];
  const rootAgent = {
    address: "local/root",
    space: "local",
    tab: "terminal",
    app: "pi",
    program: { name: "Pi", agent: true },
  };
  const rowsFor = (terminals) =>
    pickerRows(targetSpaces, "", {
      agents: [rootAgent, { ...rootAgent }],
      agentContext: true,
      terminals,
    })[0].context;
  const cycle = [
    { address: "local/root", parent: "local/worker", state: "live" },
    { address: "local/worker", parent: "local/root", state: "live" },
  ];
  const deep = [{ address: "local/root", parent: null, state: "live" }];
  for (let index = 0; index < 40; index += 1) {
    deep.push({
      address: `local/child-${index}`,
      parent: index === 0 ? "local/root" : `local/child-${index - 1}`,
      state: "live",
    });
  }

  assert.deepEqual(rowsFor(cycle).descendants, { kind: "lower-bound", count: 1 });
  assert.deepEqual(rowsFor(deep).descendants, { kind: "lower-bound", count: 32 });
  const broad = [
    { address: "local/root", parent: null, state: "live" },
    ...Array.from({ length: 2050 }, (_, index) => ({
      address: `local/child-${index}`,
      parent: "local/root",
      state: "live",
    })),
  ];
  assert.deepEqual(rowsFor(broad).descendants, { kind: "lower-bound", count: 2048 });
  const oversized = [
    { address: "local/root", parent: null, state: "live" },
    { address: "local/worker", parent: "local/root", state: "live" },
    ...Array.from({ length: 4095 }, (_, index) => ({
      address: `orphan/${index}`,
      parent: null,
      state: "live",
    })),
  ];
  assert.deepEqual(rowsFor(oversized).descendants, { kind: "lower-bound", count: 1 });
  const sharedChildren = Array.from({ length: 2048 }, (_, index) => ({
    address: `group/child-${index}`,
    parent: "group/root-4",
    state: "live",
  }));
  const groupSpaces = [
    {
      id: "group",
      name: "group",
      machine: null,
      active: true,
      tabs: Array.from({ length: 5 }, (_, index) => ({
        id: `tab-${index}`,
        name: `tab-${index}`,
        active: index === 0,
      })),
    },
  ];
  const groupAgents = Array.from({ length: 5 }, (_, index) => ({
    address: `group/root-${index}`,
    space: "group",
    tab: `tab-${index}`,
    program: { name: "Agent", agent: true },
  }));
  const groupTerminals = [
    ...Array.from({ length: 5 }, (_, index) => ({
      address: `group/root-${index}`,
      parent: index === 0 ? null : `group/root-${index - 1}`,
      state: "live",
    })),
    ...sharedChildren,
  ];
  const boundedRows = pickerRows(groupSpaces, "", {
    agents: groupAgents,
    agentContext: true,
    terminals: groupTerminals,
  });
  assert.deepEqual(boundedRows[4].context.descendants, { kind: "lower-bound", count: 0 });
  assert.deepEqual(rowsFor([{ address: "local/root", parent: null, state: "live" }]).descendants, {
    kind: "exact",
    count: 0,
  });
});
