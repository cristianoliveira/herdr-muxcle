import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";
import {
  agentRows,
  agentSelection,
  roleFor,
  spaceRows,
  spaceSelection,
  statusColor,
} from "../../.build/mods/muxcle-numbered-sidebars/model.js";

const palette = {
  background: "background",
  blocked: "blocked-tone",
  dim: "dim-tone",
  done: "done-tone",
  foreground: "foreground-tone",
  hover: "hover-tone",
  idle: "idle-tone",
  muted: "muted-tone",
  unknown: "unknown-tone",
  working: "working-tone",
};

function element() {
  const node = { handlers: {}, styles: {} };
  const builder = new Proxy(node, {
    get(target, name) {
      if (name in target) return target[name];
      if (name === "child")
        return (child) => {
          target.children ??= [];
          target.children.push(child);
          return builder;
        };
      if (name === "children")
        return (children) => {
          target.children ??= [];
          target.children.push(...children);
          return builder;
        };
      if (name === "on_click" || name === "hover")
        return (handler) => {
          target.handlers[name] = handler;
          return builder;
        };
      return (...args) => {
        target.styles[name] = args;
        return builder;
      };
    },
  });
  return builder;
}

async function createApp() {
  const calls = [];
  let role = "spaces";
  let spaceSnapshot = [];
  let agentSnapshot = [];
  let paneSnapshot = [];

  const path = new URL("../../.build/mods/muxcle-numbered-sidebars/main.js", import.meta.url);
  const source = (await readFile(path, "utf8"))
    .replace(/^import .*;$/gm, "")
    .replace(
      "export default class MuxcleNumberedSidebars",
      "globalThis.MuxcleNumberedSidebars = class MuxcleNumberedSidebars",
    );
  const scope = {
    View: class {},
    div: element,
    h_flex: element,
    v_flex: element,
    agents: () => agentSnapshot,
    panes: () => paneSnapshot,
    props: () => ({ role }),
    run: (...args) => calls.push(args),
    spaces: () => spaceSnapshot,
    theme: () => palette,
    agentRows,
    agentSelection,
    roleFor,
    spaceRows,
    spaceSelection,
    statusColor,
  };
  vm.runInNewContext(source, scope, { filename: path.pathname });

  return {
    calls,
    view: () => new scope.MuxcleNumberedSidebars(),
    setRole(value) {
      role = value;
    },
    setSpaces(value) {
      spaceSnapshot = value;
    },
    setAgents(value) {
      agentSnapshot = value;
    },
    setPanes(value) {
      paneSnapshot = value;
    },
  };
}

function findById(node, id) {
  if (node?.styles?.id?.[0] === id) return node;
  return Array.isArray(node?.children) ? node.children.map((child) => findById(child, id)).find(Boolean) : undefined;
}

function renderedText(node) {
  if (typeof node === "string") return node;
  return Array.isArray(node?.children) ? node.children.map(renderedText).join("") : "";
}

test("space rail colors status numbers and marks the selected space without relying on color", async () => {
  const app = await createApp();
  app.setSpaces([
    { id: "local/project", name: "Project", active: false, status: "working" },
    { id: "build-box/project", name: "Project", active: true, status: "blocked" },
  ]);
  const view = app.view();
  const tree = view.render({});
  const first = findById(tree, "numbered-spaces-1");
  const second = findById(tree, "numbered-spaces-2");
  const firstNumber = first.children.find((child) => renderedText(child) === "1");
  const marker = second.children[0];
  const secondNumber = second.children[1];

  assert.equal(firstNumber.styles.text_color[0], "working-tone");
  assert.equal(firstNumber.styles.loop[0], "opacity");
  assert.equal(firstNumber.styles.loop[1].from, 0.25);
  assert.equal(firstNumber.styles.loop[1].to, 1);
  assert.equal(firstNumber.styles.loop[1].period, 1600);
  assert.equal(renderedText(marker), ">");
  assert.equal(marker.styles.text_color[0], "foreground-tone");
  assert.equal(secondNumber.styles.text_color[0], "blocked-tone");
  assert.equal(renderedText(first.children[0]), " ");
});

test("space click revalidates the exact qualified id after reordering and ignores removals", async () => {
  const app = await createApp();
  const local = { id: "local/project", name: "Project", active: false, status: null };
  const remote = { id: "build-box/project", name: "Project", active: false, status: null };
  app.setSpaces([local, remote]);
  const view = app.view();
  const remoteRow = findById(view.render({}), "numbered-spaces-2");

  app.setSpaces([remote, local]);
  remoteRow.handlers.on_click();
  assert.deepEqual(app.calls, [["space.select", { id: "build-box/project" }]]);

  app.calls.length = 0;
  const staleRow = findById(view.render({}), "numbered-spaces-1");
  app.setSpaces([local]);
  staleRow.handlers.on_click();
  assert.deepEqual(app.calls, []);
});

test("agent rail keeps snapshot numbering and focuses only the exact live address/pane pair", async () => {
  const app = await createApp();
  app.setRole("agents");
  const agents = Array.from({ length: 10 }, (_, index) => ({
    address: index === 9 ? "build-box/agent-10" : `local/agent-${index + 1}`,
    pane: index === 9 ? "build-box/pane-10" : `local/pane-${index + 1}`,
    status: index === 9 ? "working" : "idle",
  }));
  const panes = agents.map(({ address, pane }) => ({ pane, terminal: address }));
  app.setAgents(agents);
  app.setPanes(panes);
  const view = app.view();
  const tenth = findById(view.render({}), "numbered-agents-10");
  const number = tenth.children.find((child) => renderedText(child) === "10");
  assert.equal(number.styles.text_color[0], "working-tone");
  assert.equal(number.styles.loop[0], "opacity");
  assert.equal(number.styles.loop[1].from, 0.25);
  assert.equal(number.styles.loop[1].to, 1);
  assert.equal(number.styles.loop[1].period, 1600);

  app.setAgents([...agents].reverse());
  app.setPanes([...panes].reverse());
  tenth.handlers.on_click();
  assert.deepEqual(app.calls, [["pane.focus", { pane: "build-box/pane-10" }]]);

  app.calls.length = 0;
  app.setAgents([{ address: "build-box/agent-10", pane: "build-box/pane-reused", status: "idle" }]);
  app.setPanes([{ pane: "build-box/pane-reused", terminal: "build-box/agent-10" }]);
  tenth.handlers.on_click();
  assert.deepEqual(app.calls, []);
});

test("unknown agent status and missing pane are explicit and non-selectable", async () => {
  const app = await createApp();
  app.setRole("agents");
  app.setAgents([{ address: "machine/agent", status: undefined }]);
  app.setPanes([]);
  const view = app.view();
  const row = findById(view.render({}), "numbered-agents-1");
  const number = row.children.at(-1);

  assert.equal(number.styles.text_color[0], "unknown-tone");
  assert.equal(renderedText(row), "?1");
  assert.equal(row.handlers.on_click, undefined);
});

test("unsupported roles render a neutral marker and never query or select targets", async () => {
  const app = await createApp();
  app.setRole("tabs");
  const tree = app.view().render({});

  assert.equal(renderedText(tree), "?");
  assert.deepEqual(app.calls, []);
});

test("both rails keep viewport-exceeding lists scrollable with nonshrinking rows", async () => {
  const app = await createApp();
  const viewportHeight = 260;
  const count = 20;
  app.setSpaces(
    Array.from({ length: count }, (_, index) => ({
      id: `space-${index + 1}`,
      active: false,
      status: "idle",
    })),
  );

  const spaceList = findById(app.view().render({}), "numbered-spaces-list");
  assert.equal(spaceList.styles.min_h[0], 0);
  assert.ok(spaceList.styles.overflow_y_scrollbar);
  assert.deepEqual(spaceList.styles.mode, ["always"]);
  assert.ok(spaceList.children.length * spaceList.children[0].styles.h[0] > viewportHeight);
  assert.equal(spaceList.children.length, count);
  assert.ok(spaceList.children.every((row) => row.styles.flex_none));

  app.setRole("agents");
  app.setAgents(
    Array.from({ length: count }, (_, index) => ({
      address: `machine/agent-${index + 1}`,
      pane: `machine/pane-${index + 1}`,
      status: "idle",
    })),
  );
  const agentList = findById(app.view().render({}), "numbered-agents-list");
  assert.ok(agentList.styles.overflow_y_scrollbar);
  assert.deepEqual(agentList.styles.mode, ["always"]);
  assert.ok(agentList.children.length * agentList.children[0].styles.h[0] > viewportHeight);
  assert.equal(agentList.children.length, count);
  assert.ok(agentList.children.every((row) => row.styles.flex_none));
});

test("role props passed to init override the ambient role", async () => {
  const app = await createApp();
  app.setRole("spaces");
  app.setAgents([{ address: "machine/agent", pane: "machine/pane", status: "idle" }]);
  const view = app.view();
  view.init({ role: "agents" }, {});

  assert.ok(findById(view.render({}), "numbered-agents-1"));
});

test("empty space and agent snapshots render a quiet placeholder", async () => {
  const app = await createApp();
  const view = app.view();

  app.setSpaces([]);
  assert.equal(renderedText(view.render({})), "–");

  app.setRole("agents");
  app.setAgents([]);
  assert.equal(renderedText(view.render({})), "–");
});
