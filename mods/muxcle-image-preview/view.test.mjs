import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";
import { imagePath, fitImage, previewAsset } from "../../.build/mods/muxcle-image-preview/model.js";

function element() {
  const node = { handlers: {}, childNodes: [] };
  const builder = new Proxy(node, {
    get(target, name) {
      if (name in target) return target[name];
      if (name === "child")
        return (child) => {
          target.childNodes.push(child);
          return builder;
        };
      if (name === "children")
        return (children) => {
          target.childNodes.push(...children);
          return builder;
        };
      if (name === "when") return (condition, apply) => (condition ? apply(builder) : builder);
      return (...args) => {
        target.handlers[name] = args;
        return builder;
      };
    },
  });
  return builder;
}

function elementIds(node) {
  return [
    ...(node.handlers.id ?? []),
    ...node.childNodes.flatMap((child) => (child?.handlers ? elementIds(child) : [])),
  ];
}

async function viewer({ clipboard = "", result, options } = {}) {
  const path = new URL("../../.build/mods/muxcle-image-preview/main.js", import.meta.url);
  const source = (await readFile(path, "utf8"))
    .replace(/^import .*;$/gm, "")
    .replace("export default class ImagePreview", "globalThis.Preview = class ImagePreview");
  const calls = [];
  const commands = [];
  const closed = [];
  const tasks = [];
  const scope = {
    View: class {},
    div: element,
    image: element,
    v_flex: element,
    h_flex: element,
    imagePath,
    fitImage,
    previewAsset,
    theme: () => ({}),
    window: { viewport_size: () => ({ width: 1200, height: 800 }) },
    Input: { new: element },
    InputState: {
      new: ({ value }) => ({
        value: () => value,
        set_value: (next) => {
          value = next;
        },
        on() {},
        focus() {},
      }),
    },
    focused: () => ({ space: "mac/project", cwd: "/remote/project" }),
    spaces: () => [{ id: "mac/project", machine: "mac", folder: "/remote/project" }],
    machines: () => [
      { name: null, layout: "ready" },
      { name: "mac", layout: "ready" },
    ],
    props: () => ({ overlay: "preview" }),
    closeOverlay: (id) => closed.push(id),
    appHome: () => "/app",
    exec: async (command, args) => {
      commands.push({ command, args: Array.from(args) });
      calls.push(Array.from(args));
      if (args.includes("--clipboard")) return { code: 0, stdout: JSON.stringify({ path: clipboard }) };
      return (
        result ?? {
          code: 0,
          stdout: JSON.stringify({ width: 1600, height: 800, path: `/app/image-previews/image-${"a".repeat(64)}.png` }),
        }
      );
    },
  };
  vm.runInNewContext(source, scope, { filename: path.pathname });
  const mod = new scope.Preview();
  const cx = {
    focus_handle() {
      return { focus() {} };
    },
    notify() {},
    stop_propagation() {},
    spawn: (task) => tasks.push(task(cx)),
  };
  mod.init(options, cx);
  return {
    mod,
    cx,
    calls,
    commands,
    closed,
    async settle() {
      for (let i = 0; i < tasks.length; i++) await tasks[i];
    },
  };
}

test("copied image path opens on the source machine without sending terminal input", async () => {
  const v = await viewer({ clipboard: "/tmp/shot.png" });
  await v.settle();

  assert.equal(v.mod.preview.machine, "mac");
  assert.equal(v.mod.preview.source, "/tmp/shot.png");
  assert.equal(v.calls[1][v.calls[1].indexOf("--cwd") + 1], "/remote/project");
  assert.deepEqual(v.commands[1], {
    command: "python3",
    args: [
      "/app/mods/muxcle-image-preview/preview.py",
      "/tmp/shot.png",
      "--machine",
      "mac",
      "--cwd",
      "/remote/project",
      "--cache",
      "/app/image-previews",
    ],
  });
  assert.equal(v.calls[1][v.calls[1].indexOf("--machine") + 1], "mac");
  assert.equal(v.mod.render().handlers.w[0], 1200);
  assert.equal(v.mod.render().handlers.h[0], 800);
  assert.equal(v.mod.controls, false);
  const hiddenIds = elementIds(v.mod.render());
  assert.equal(hiddenIds.includes("image-load"), false);
  assert.equal(
    hiddenIds.some((id) => id.startsWith("image-machine-")),
    false,
  );
});

test("empty clipboard leaves a manual path field; local override does not inherit remote cwd", async () => {
  const v = await viewer({ options: { machine: "" } });
  await v.settle();

  assert.equal(v.mod.preview, null);
  assert.equal(v.calls.length, 1);
  v.mod.input.set_value("/tmp/image's $(touch NEVER).png");
  v.mod.load(v.cx);
  await v.settle();

  assert.equal(v.mod.preview.machine, "");
  assert.equal(v.calls[1][1], "/tmp/image's $(touch NEVER).png");
  assert.equal(v.calls[1][v.calls[1].indexOf("--cwd") + 1], "");
});

test("failed loads report error and Escape closes only the popup", async () => {
  const v = await viewer({ options: { path: "/missing.png" }, result: { code: 1, stderr: "File missing" } });
  await v.settle();

  assert.equal(v.mod.preview, null);
  assert.equal(v.mod.error, "File missing");
  v.mod.render().handlers.on_key_down[0]({ key: "escape" }, v.cx);
  assert.deepEqual(v.closed, ["preview"]);
});

test("editing controls can be reopened without closing the full-window image", async () => {
  const v = await viewer({ options: { path: "shot.png" } });
  await v.settle();

  v.mod.render().handlers.on_key_down[0]({ key: "e" }, v.cx);

  assert.equal(v.mod.controls, true);
  assert.equal(v.mod.preview.source, "shot.png");
  assert.equal(elementIds(v.mod.render()).includes("image-load"), true);
});

test("dropping an image opens it locally even when source space is remote", async () => {
  const v = await viewer();
  await v.settle();

  v.mod.render().handlers.on_drop[0]({ paths: ["/tmp/dropped image.png"] }, v.cx);
  await v.settle();

  assert.equal(v.mod.preview.machine, "");
  assert.equal(v.mod.preview.source, "/tmp/dropped image.png");
  assert.equal(v.mod.controls, false);
});

test("changing machines clears the old preview and uses that machine's home", async () => {
  const v = await viewer({ options: { path: "shot.png" } });
  await v.settle();

  v.mod.selectMachine("", v.cx);

  assert.equal(v.mod.machine, "");
  assert.equal(v.mod.cwd, "");
  assert.equal(v.mod.preview, null);
});
