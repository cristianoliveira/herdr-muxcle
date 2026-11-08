import assert from "node:assert/strict";
import test from "node:test";
import { pickerRows, selectedRowKey, selectionAction } from "../../.build/mods/muxcle-picker/model.js";

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
