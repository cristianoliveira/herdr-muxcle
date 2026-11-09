import assert from "node:assert/strict";
import test from "node:test";
import { observeRecentTabs } from "../../.build/mods/muxcle-history/model.js";
import {
  hasVisibleHistoryBlock,
  parsePickerOrder,
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

test("picker config is an explicit, bounded opt-in and corrupt values default to native", () => {
  assert.equal(parsePickerOrder(null), "native");
  assert.equal(parsePickerOrder("not json"), "native");
  assert.equal(parsePickerOrder(" ".repeat(4097)), "native");
  assert.equal(parsePickerOrder('{"schema":2,"order":"recent"}'), "native");
  assert.equal(parsePickerOrder('{"schema":1,"order":"native"}'), "native");
  assert.equal(parsePickerOrder('{"schema":1,"order":"recent"}'), "recent");
});
