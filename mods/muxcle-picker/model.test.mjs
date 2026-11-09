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

test("selection follows stable identity through renames and falls back if removed", () => {
  const rows = pickerRows(spaces, "");
  const renamed = [{ ...spaces[0], name: "renamed" }, ...spaces.slice(1)];

  assert.equal(selectedRowKey(rows, null), rows[0].key);
  assert.equal(selectedRowKey(pickerRows(renamed, ""), rows[1].key), rows[1].key);
  assert.equal(selectedRowKey(rows.slice(2), rows[1].key), rows[2].key);
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

  assert.deepEqual(pickerRows(spaces, "", "native", recent), pickerRows(spaces, ""));
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
  const rows = pickerRows(spaces, "", "recent", recent, true);

  assert.deepEqual(
    rows.map(({ label }) => label),
    ["project → logs", "dotfiles → crew", "dotfiles → editor", "empty space"],
  );
  assert.deepEqual(spaces, before);
  assert.equal(selectedRowKey(rows, null), rows.find((row) => row.active)?.key);
  assert.deepEqual(pickerRows(spaces, "", "native", recent), pickerRows(spaces, ""));
});

test("missing observer data falls back to native order and stale visits cannot rank targets", () => {
  assert.deepEqual(pickerRows(spaces, "", "recent", null, true), pickerRows(spaces, ""));
  assert.deepEqual(
    pickerRows(spaces, "", "recent", { schema: 2, visits: [{ space: "local", tab: "terminal" }] }, true),
    pickerRows(spaces, ""),
  );
  assert.deepEqual(
    pickerRows(spaces, "", "recent", { schema: 1, visits: [{ space: "gone", tab: "closed" }] }, true),
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
    pickerRows(spaces, "", "recent", recent, hasVisibleHistoryBlock(layoutWithoutHistory)),
    pickerRows(spaces, ""),
  );
  assert.deepEqual(recent.visits, [{ space: "server:project", tab: "server:terminal" }]);
});

test("unmount, remount, and restart-like layout changes gate persisted MRU without erasing it", () => {
  const recent = { schema: 1, visits: [{ space: "server:project", tab: "server:terminal" }] };
  const historyBlock = { id: "history", type: "block", content: { mod: "muxcle-history" } };
  const mountedLayout = { id: "root", type: "row", children: [historyBlock] };
  const unmountedLayout = { id: "root", type: "row", children: [] };
  const rowsFor = (currentLayout) => pickerRows(spaces, "", "recent", recent, hasVisibleHistoryBlock(currentLayout));

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

test("picker config is an explicit, bounded opt-in and corrupt values default to native", () => {
  assert.equal(parsePickerOrder(null), "native");
  assert.equal(parsePickerOrder("not json"), "native");
  assert.equal(parsePickerOrder(" ".repeat(4097)), "native");
  assert.equal(parsePickerOrder('{"schema":2,"order":"recent"}'), "native");
  assert.equal(parsePickerOrder('{"schema":1,"order":"native"}'), "native");
  assert.equal(parsePickerOrder('{"schema":1,"order":"recent"}'), "recent");
});
