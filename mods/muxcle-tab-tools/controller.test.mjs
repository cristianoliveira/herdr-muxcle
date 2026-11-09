import assert from "node:assert/strict";
import test from "node:test";
import { MovePositionController, TabToolsController } from "../../.build/mods/muxcle-tab-tools/controller.js";

const initialSpaces = [
  {
    id: "local",
    name: "local",
    machine: null,
    active: true,
    tabs: [
      { id: "a", name: "a", active: false, zoomed: false, panes: 1 },
      { id: "b", name: "b", active: true, zoomed: false, panes: 1 },
      { id: "c", name: "c", active: false, zoomed: false, panes: 1 },
    ],
  },
  {
    id: "server/space",
    name: "remote",
    machine: "server",
    active: false,
    tabs: [{ id: "server/tab", name: "remote", active: true, zoomed: false, panes: 1 }],
  },
];

function harness() {
  let spaces = initialSpaces;
  let focused = { space: "local", tab: "b", pane: "p", terminal: "t", shown: null, cwd: "/work/project" };
  const calls = { commands: [], prompts: [], notices: [], closes: 0 };
  const controller = new TabToolsController({
    spaces: () => spaces,
    focused: () => focused,
    run: (action) => calls.commands.push(action),
    openPosition: (target) => calls.prompts.push(target),
    notify: (message, level) => calls.notices.push({ message, level }),
  });
  return {
    controller,
    calls,
    setSpaces(value) {
      spaces = value;
    },
    setFocused(value) {
      focused = value;
    },
    position(target) {
      return new MovePositionController(target, {
        spaces: () => spaces,
        run: (action) => calls.commands.push(action),
        close: () => calls.closes++,
      });
    },
  };
}

test("dispatches left and right movement through the native tab.move command", () => {
  const { controller, calls } = harness();

  controller.handle("move-left");
  controller.handle("move-right");

  assert.deepEqual(calls.commands, [
    { command: "tab.move", args: { id: "b", index: 1 } },
    { command: "tab.move", args: { id: "b", index: 3 } },
  ]);
});

test("opens position entry with captured identity even if focus changes later", () => {
  const h = harness();
  h.controller.handle("move-position");
  h.setFocused({
    space: "server/space",
    tab: "server/tab",
    pane: "remote-pane",
    terminal: "remote-term",
    shown: null,
    cwd: "/srv",
  });

  assert.deepEqual(h.calls.prompts, [{ spaceId: "local", tabId: "b" }]);
  const prompt = h.position(h.calls.prompts[0]);
  assert.deepEqual(prompt.submit("0"), {
    kind: "move",
    action: { command: "tab.move", args: { id: "b", index: 1 } },
  });
  assert.deepEqual(h.calls.commands, [{ command: "tab.move", args: { id: "b", index: 1 } }]);
  assert.equal(h.calls.closes, 1);
});

test("refuses a position prompt when focus has no live tab", () => {
  const h = harness();
  h.setFocused(null);

  h.controller.handle("move-position");

  assert.deepEqual(h.calls.prompts, []);
  assert.deepEqual(h.calls.notices, [
    { message: "Focus a tab in an open space before choosing its position.", level: "info" },
  ]);
});

test("ignores unknown commands", () => {
  const h = harness();

  h.controller.handle("not-a-tab-tool");

  assert.deepEqual(h.calls.commands, []);
  assert.deepEqual(h.calls.prompts, []);
  assert.deepEqual(h.calls.notices, []);
});

test("reports native command dispatch errors without claiming completion", () => {
  const notices = [];
  const controller = new TabToolsController({
    spaces: () => initialSpaces,
    focused: () => ({ space: "local", tab: "b", pane: "p", terminal: "t", shown: null, cwd: "/work" }),
    run: () => {
      throw new Error("bridge unavailable");
    },
    openPosition: () => {},
    notify: (message, level) => notices.push({ message, level }),
  });

  controller.handle("move-left");

  assert.deepEqual(notices, [
    { message: "Could not move that tab. Check its position and try again.", level: "error" },
  ]);
});

test("keeps a failed position submission open and permits cancellation", () => {
  let closes = 0;
  const prompt = new MovePositionController(
    { spaceId: "local", tabId: "b" },
    {
      spaces: () => initialSpaces,
      run: () => {
        throw new Error("bridge unavailable");
      },
      close: () => closes++,
    },
  );

  assert.equal(prompt.submit("0").kind, "refused");
  assert.equal(closes, 0);
  assert.equal(prompt.cancel(), true);
  assert.equal(closes, 1);
});

test("disposed prompts reject later submissions without closing twice", () => {
  const h = harness();
  const prompt = h.position({ spaceId: "local", tabId: "b" });

  prompt.dispose();

  assert.deepEqual(prompt.submit("0"), { kind: "closed" });
  assert.equal(h.calls.closes, 0);
  assert.deepEqual(h.calls.commands, []);
});

test("refuses a vanished target or invalid position without issuing a command", () => {
  const h = harness();
  const prompt = h.position({ spaceId: "local", tabId: "b" });
  h.setSpaces([{ ...initialSpaces[0], tabs: initialSpaces[0].tabs.filter((tab) => tab.id !== "b") }]);

  assert.equal(prompt.submit("0").kind, "refused");
  assert.deepEqual(h.calls.commands, []);
  assert.equal(h.calls.closes, 0);

  const invalid = h.position({ spaceId: "local", tabId: "a" });
  assert.equal(invalid.submit("-1").kind, "refused");
  assert.deepEqual(h.calls.commands, []);
});

test("cancel closes the prompt once and prevents later submission", () => {
  const h = harness();
  const prompt = h.position({ spaceId: "local", tabId: "b" });

  assert.equal(prompt.cancel(), true);
  assert.equal(prompt.cancel(), false);
  assert.equal(prompt.submit("0").kind, "closed");
  assert.deepEqual(h.calls.commands, []);
  assert.equal(h.calls.closes, 1);
});

test("rename-from-cwd targets the focused remote tab without local filesystem access", () => {
  const h = harness();
  h.setFocused({
    space: "server/space",
    tab: "server/tab",
    pane: null,
    terminal: "server/terminal",
    shown: null,
    cwd: "/srv/caf\u00e9/",
  });

  h.controller.handle("rename-from-cwd");

  assert.deepEqual(h.calls.commands, [{ command: "tab.rename", args: { id: "server/tab", name: "caf\u00e9" } }]);
  assert.deepEqual(h.calls.notices, []);
});

test("uses the cwd and tab from one focused snapshot instead of mixing a later focus", () => {
  let focusReads = 0;
  const commands = [];
  const controller = new TabToolsController({
    spaces: () => initialSpaces,
    focused: () => {
      focusReads++;
      return focusReads === 1
        ? { space: "server/space", tab: "server/tab", pane: null, terminal: "remote", shown: null, cwd: "/srv/first" }
        : { space: "local", tab: "b", pane: "p", terminal: "local", shown: null, cwd: "/work/second" };
    },
    run: (action) => commands.push(action),
    openPosition: () => {},
    notify: () => {},
  });

  controller.handle("rename-from-cwd");

  assert.equal(focusReads, 1);
  assert.deepEqual(commands, [{ command: "tab.rename", args: { id: "server/tab", name: "first" } }]);
});

test("reports an unsupported folder-naming context without dispatching", () => {
  const h = harness();
  h.setFocused({ space: "local", tab: "b", pane: "p", terminal: null, shown: null, cwd: null });

  h.controller.handle("rename-from-cwd");

  assert.deepEqual(h.calls.commands, []);
  assert.equal(h.calls.notices.length, 1);
  assert.equal(h.calls.notices[0].level, "info");
});
