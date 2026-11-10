import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { createReadStream, readFileSync } from "node:fs";
import { chmod, copyFile, mkdir, mkdtemp, readFile, readdir, rename, rm, utimes, writeFile } from "node:fs/promises";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repositoryRoot = fileURLToPath(new URL("../", import.meta.url));
const appPackage = {
  name: "herdr-muxcle",
  release: {
    title: "Herdr Muxcle scaffold",
    summary: "Optional static starter layout and compatibility status; not an all-in-one bundle.",
    installationPath: "RECIPE.md",
  },
  files: [
    "check-install-targets.sh",
    "layouts/muxcle.json",
    "mods/muxcle-compat/main.js",
    "mods/muxcle-compat/mod.json",
    "RECIPE.md",
  ],
  directories: ["", "layouts", "mods", "mods/muxcle-compat"],
  sources: [
    ["scripts/check-install-targets.sh", "check-install-targets.sh"],
    ["layouts/muxcle.json", "layouts/muxcle.json"],
    ["mods/muxcle-compat/mod.json", "mods/muxcle-compat/mod.json"],
    [".build/mods/muxcle-compat/main.js", "mods/muxcle-compat/main.js"],
    ["RECIPE.md", "RECIPE.md"],
  ],
};
const tmuxKeysPackage = {
  name: "muxcle-tmux-keys",
  release: {
    title: "Tmux-inspired keys",
    summary: "Optional tmux-inspired key bindings for Herdr.",
    installationPath: "packages/tmux-keys/RECIPE.md",
  },
  files: ["keys.json", "RECIPE.md"],
  directories: [""],
  sources: [
    ["packages/tmux-keys/keys.json", "keys.json"],
    ["packages/tmux-keys/RECIPE.md", "RECIPE.md"],
  ],
};
const sessionizerPackage = {
  name: "muxcle-sessionizer",
  release: {
    title: "Sessionizer",
    summary:
      "Find configured local or connected-machine project folders and safely open their machine-scoped Herdr space.",
    installationPath: "packages/sessionizer/RECIPE.md",
  },
  files: [
    "check-install-targets.sh",
    "config.example.json",
    "keys.json",
    "mods/muxcle-sessionizer/discover.py",
    "mods/muxcle-sessionizer/main.js",
    "mods/muxcle-sessionizer/mod.json",
    "mods/muxcle-sessionizer/package-owner.json",
    "mods/muxcle-sessionizer/sessionizer/adapter.js",
    "mods/muxcle-sessionizer/sessionizer/controller.js",
    "mods/muxcle-sessionizer/sessionizer/discovery.js",
    "mods/muxcle-sessionizer/sessionizer/model.js",
    "RECIPE.md",
  ],
  directories: ["", "mods", "mods/muxcle-sessionizer", "mods/muxcle-sessionizer/sessionizer"],
  sources: [
    ["packages/sessionizer/check-install-targets.sh", "check-install-targets.sh"],
    ["packages/sessionizer/config.example.json", "config.example.json"],
    ["packages/sessionizer/keys.json", "keys.json"],
    ["mods/muxcle-sessionizer/discover.py", "mods/muxcle-sessionizer/discover.py"],
    [".build/mods/muxcle-sessionizer/main.js", "mods/muxcle-sessionizer/main.js"],
    ["mods/muxcle-sessionizer/mod.json", "mods/muxcle-sessionizer/mod.json"],
    ["mods/muxcle-sessionizer/package-owner.json", "mods/muxcle-sessionizer/package-owner.json"],
    [".build/mods/muxcle-sessionizer/sessionizer/adapter.js", "mods/muxcle-sessionizer/sessionizer/adapter.js"],
    [".build/mods/muxcle-sessionizer/sessionizer/controller.js", "mods/muxcle-sessionizer/sessionizer/controller.js"],
    [".build/mods/muxcle-sessionizer/sessionizer/discovery.js", "mods/muxcle-sessionizer/sessionizer/discovery.js"],
    [".build/mods/muxcle-sessionizer/sessionizer/model.js", "mods/muxcle-sessionizer/sessionizer/model.js"],
    ["packages/sessionizer/RECIPE.md", "RECIPE.md"],
  ],
};
const pickerPackage = {
  name: "muxcle-picker",
  release: {
    title: "Spaces and tabs picker",
    summary: "Search Herdr spaces and tabs by label, machine, and associated agent, with optional recency ordering.",
    installationPath: "packages/picker/RECIPE.md",
  },
  files: [
    "check-install-targets.sh",
    "config.example.json",
    "keys.json",
    "RECIPE.md",
    "mods/muxcle-picker/main.js",
    "mods/muxcle-picker/model.js",
    "mods/muxcle-picker/mod.json",
    "mods/muxcle-picker/package-owner.json",
  ],
  directories: ["", "mods", "mods/muxcle-picker"],
  sources: [
    ["packages/picker/check-install-targets.sh", "check-install-targets.sh"],
    ["packages/picker/config.example.json", "config.example.json"],
    ["packages/picker/keys.json", "keys.json"],
    ["packages/picker/RECIPE.md", "RECIPE.md"],
    [".build/mods/muxcle-picker/main.js", "mods/muxcle-picker/main.js"],
    [".build/mods/muxcle-picker/model.js", "mods/muxcle-picker/model.js"],
    ["mods/muxcle-picker/mod.json", "mods/muxcle-picker/mod.json"],
    ["mods/muxcle-picker/package-owner.json", "mods/muxcle-picker/package-owner.json"],
  ],
};
const historyPackage = {
  name: "muxcle-history",
  release: {
    title: "Navigation history",
    summary:
      "Toggle between recent tabs or spaces and optionally provide full recency data to the Picker using one mounted observer block.",
    installationPath: "packages/history/RECIPE.md",
  },
  files: [
    "check-install-targets.sh",
    "keys.json",
    "observer.json",
    "RECIPE.md",
    "mods/muxcle-history/main.js",
    "mods/muxcle-history/model.js",
    "mods/muxcle-history/mod.json",
    "mods/muxcle-history/package-owner.json",
  ],
  directories: ["", "mods", "mods/muxcle-history"],
  sources: [
    ["packages/history/check-install-targets.sh", "check-install-targets.sh"],
    ["packages/history/keys.json", "keys.json"],
    ["packages/history/observer.json", "observer.json"],
    ["packages/history/RECIPE.md", "RECIPE.md"],
    [".build/mods/muxcle-history/main.js", "mods/muxcle-history/main.js"],
    [".build/mods/muxcle-history/model.js", "mods/muxcle-history/model.js"],
    ["mods/muxcle-history/mod.json", "mods/muxcle-history/mod.json"],
    ["mods/muxcle-history/package-owner.json", "mods/muxcle-history/package-owner.json"],
  ],
};
const rotationPackage = {
  name: "muxcle-rotation",
  release: {
    title: "Pane rotation",
    summary: "Rotate pane contents in a personal layout using one command-host block.",
    installationPath: "packages/rotation/RECIPE.md",
  },
  files: [
    "check-install-targets.sh",
    "keys.json",
    "host.json",
    "RECIPE.md",
    "mods/muxcle-rotation/main.js",
    "mods/muxcle-rotation/model.js",
    "mods/muxcle-rotation/controller.js",
    "mods/muxcle-rotation/adapter.js",
    "mods/muxcle-rotation/rotate.py",
    "mods/muxcle-rotation/mod.json",
    "mods/muxcle-rotation/package-owner.json",
  ],
  directories: ["", "mods", "mods/muxcle-rotation"],
  sources: [
    ["packages/rotation/check-install-targets.sh", "check-install-targets.sh"],
    ["packages/rotation/keys.json", "keys.json"],
    ["packages/rotation/host.json", "host.json"],
    ["packages/rotation/RECIPE.md", "RECIPE.md"],
    [".build/mods/muxcle-rotation/main.js", "mods/muxcle-rotation/main.js"],
    [".build/mods/muxcle-rotation/model.js", "mods/muxcle-rotation/model.js"],
    [".build/mods/muxcle-rotation/controller.js", "mods/muxcle-rotation/controller.js"],
    [".build/mods/muxcle-rotation/adapter.js", "mods/muxcle-rotation/adapter.js"],
    ["mods/muxcle-rotation/rotate.py", "mods/muxcle-rotation/rotate.py"],
    ["mods/muxcle-rotation/mod.json", "mods/muxcle-rotation/mod.json"],
    ["mods/muxcle-rotation/package-owner.json", "mods/muxcle-rotation/package-owner.json"],
  ],
};
const sizingPackage = {
  name: "muxcle-sizing",
  release: {
    title: "Pane sizing",
    summary: "Equalize and resize flexible pane groups, including a 4% height strip, using one command-host block.",
    installationPath: "packages/sizing/RECIPE.md",
  },
  files: [
    "check-install-targets.sh",
    "keys.json",
    "host.json",
    "RECIPE.md",
    "mods/muxcle-sizing/main.js",
    "mods/muxcle-sizing/model.js",
    "mods/muxcle-sizing/controller.js",
    "mods/muxcle-sizing/adapter.js",
    "mods/muxcle-sizing/equalize.py",
    "mods/muxcle-sizing/mod.json",
    "mods/muxcle-sizing/package-owner.json",
  ],
  directories: ["", "mods", "mods/muxcle-sizing"],
  sources: [
    ["packages/sizing/check-install-targets.sh", "check-install-targets.sh"],
    ["packages/sizing/keys.json", "keys.json"],
    ["packages/sizing/host.json", "host.json"],
    ["packages/sizing/RECIPE.md", "RECIPE.md"],
    [".build/mods/muxcle-sizing/main.js", "mods/muxcle-sizing/main.js"],
    [".build/mods/muxcle-sizing/model.js", "mods/muxcle-sizing/model.js"],
    [".build/mods/muxcle-sizing/controller.js", "mods/muxcle-sizing/controller.js"],
    [".build/mods/muxcle-sizing/adapter.js", "mods/muxcle-sizing/adapter.js"],
    ["mods/muxcle-sizing/equalize.py", "mods/muxcle-sizing/equalize.py"],
    ["mods/muxcle-sizing/mod.json", "mods/muxcle-sizing/mod.json"],
    ["mods/muxcle-sizing/package-owner.json", "mods/muxcle-sizing/package-owner.json"],
  ],
};
const repeatPackage = {
  name: "muxcle-repeat",
  release: {
    title: "Navigation repeat",
    summary: "Enter a visible, timed mode for allowlisted native tab and pane navigation.",
    installationPath: "packages/repeat/RECIPE.md",
  },
  files: [
    "check-install-targets.sh",
    "keys.json",
    "RECIPE.md",
    "mods/muxcle-repeat/main.js",
    "mods/muxcle-repeat/repeat.js",
    "mods/muxcle-repeat/mod.json",
    "mods/muxcle-repeat/package-owner.json",
  ],
  directories: ["", "mods", "mods/muxcle-repeat"],
  sources: [
    ["packages/repeat/check-install-targets.sh", "check-install-targets.sh"],
    ["packages/repeat/keys.json", "keys.json"],
    ["packages/repeat/RECIPE.md", "RECIPE.md"],
    [".build/mods/muxcle-repeat/main.js", "mods/muxcle-repeat/main.js"],
    [".build/mods/muxcle-repeat/repeat.js", "mods/muxcle-repeat/repeat.js"],
    ["mods/muxcle-repeat/mod.json", "mods/muxcle-repeat/mod.json"],
    ["mods/muxcle-repeat/package-owner.json", "mods/muxcle-repeat/package-owner.json"],
  ],
};
const projectPopupPackage = {
  name: "muxcle-project-popup",
  release: {
    title: "Project popup",
    summary: "Run the focused local project's executable .tmp/popup only after explicit confirmation.",
    installationPath: "packages/project-popup/RECIPE.md",
  },
  files: [
    "check-install-targets.sh",
    "keys.json",
    "RECIPE.md",
    "mods/muxcle-project-popup/main.js",
    "mods/muxcle-project-popup/popup.js",
    "mods/muxcle-project-popup/mod.json",
    "mods/muxcle-project-popup/package-owner.json",
  ],
  directories: ["", "mods", "mods/muxcle-project-popup"],
  sources: [
    ["packages/project-popup/check-install-targets.sh", "check-install-targets.sh"],
    ["packages/project-popup/keys.json", "keys.json"],
    ["packages/project-popup/RECIPE.md", "RECIPE.md"],
    [".build/mods/muxcle-project-popup/main.js", "mods/muxcle-project-popup/main.js"],
    [".build/mods/muxcle-project-popup/popup.js", "mods/muxcle-project-popup/popup.js"],
    ["mods/muxcle-project-popup/mod.json", "mods/muxcle-project-popup/mod.json"],
    ["mods/muxcle-project-popup/package-owner.json", "mods/muxcle-project-popup/package-owner.json"],
  ],
};
const copyModePackage = {
  name: "muxcle-copy-mode",
  release: {
    title: "Keyboard copy mode",
    summary: "Capture the actually displayed local or remote terminal into an isolated local keyboard snapshot viewer.",
    installationPath: "packages/copy-mode/RECIPE.md",
  },
  files: [
    "check-install-targets.sh",
    "keys.json",
    "RECIPE.md",
    "mods/muxcle-copy-mode/copy-mode.js",
    "mods/muxcle-copy-mode/copy-mode.lua",
    "mods/muxcle-copy-mode/copy_mode.py",
    "mods/muxcle-copy-mode/main.js",
    "mods/muxcle-copy-mode/mod.json",
    "mods/muxcle-copy-mode/package-owner.json",
  ],
  directories: ["", "mods", "mods/muxcle-copy-mode"],
  sources: [
    ["packages/copy-mode/check-install-targets.sh", "check-install-targets.sh"],
    ["packages/copy-mode/keys.json", "keys.json"],
    ["packages/copy-mode/RECIPE.md", "RECIPE.md"],
    [".build/mods/muxcle-copy-mode/copy-mode.js", "mods/muxcle-copy-mode/copy-mode.js"],
    ["mods/muxcle-copy-mode/copy-mode.lua", "mods/muxcle-copy-mode/copy-mode.lua"],
    ["mods/muxcle-copy-mode/copy_mode.py", "mods/muxcle-copy-mode/copy_mode.py"],
    [".build/mods/muxcle-copy-mode/main.js", "mods/muxcle-copy-mode/main.js"],
    ["mods/muxcle-copy-mode/mod.json", "mods/muxcle-copy-mode/mod.json"],
    ["mods/muxcle-copy-mode/package-owner.json", "mods/muxcle-copy-mode/package-owner.json"],
  ],
};
const tabToolsPackage = {
  name: "muxcle-tab-tools",
  release: {
    title: "Tab tools",
    summary: "Move tabs and name them from the focused terminal folder using native Herdr commands.",
    installationPath: "packages/tab-tools/RECIPE.md",
  },
  files: [
    "check-install-targets.sh",
    "host.json",
    "keys.json",
    "RECIPE.md",
    "mods/muxcle-tab-tools/main.js",
    "mods/muxcle-tab-tools/model.js",
    "mods/muxcle-tab-tools/controller.js",
    "mods/muxcle-tab-tools/mod.json",
    "mods/muxcle-tab-tools/package-owner.json",
  ],
  directories: ["", "mods", "mods/muxcle-tab-tools"],
  sources: [
    ["packages/tab-tools/check-install-targets.sh", "check-install-targets.sh"],
    ["packages/tab-tools/host.json", "host.json"],
    ["packages/tab-tools/keys.json", "keys.json"],
    ["packages/tab-tools/RECIPE.md", "RECIPE.md"],
    [".build/mods/muxcle-tab-tools/main.js", "mods/muxcle-tab-tools/main.js"],
    [".build/mods/muxcle-tab-tools/model.js", "mods/muxcle-tab-tools/model.js"],
    [".build/mods/muxcle-tab-tools/controller.js", "mods/muxcle-tab-tools/controller.js"],
    ["mods/muxcle-tab-tools/mod.json", "mods/muxcle-tab-tools/mod.json"],
    ["mods/muxcle-tab-tools/package-owner.json", "mods/muxcle-tab-tools/package-owner.json"],
  ],
};
const spaceCloserPackage = {
  name: "muxcle-space-closer",
  release: {
    title: "Review and close spaces",
    summary:
      "Select exact local or remote Herdr spaces, review their machine and tab identities, then explicitly dispatch native close requests.",
    installationPath: "packages/space-closer/RECIPE.md",
  },
  files: [
    "check-install-targets.sh",
    "RECIPE.md",
    "mods/muxcle-space-closer/adapter.js",
    "mods/muxcle-space-closer/controller.js",
    "mods/muxcle-space-closer/main.js",
    "mods/muxcle-space-closer/model.js",
    "mods/muxcle-space-closer/mod.json",
    "mods/muxcle-space-closer/package-owner.json",
  ],
  directories: ["", "mods", "mods/muxcle-space-closer"],
  sources: [
    ["packages/space-closer/check-install-targets.sh", "check-install-targets.sh"],
    ["packages/space-closer/RECIPE.md", "RECIPE.md"],
    [".build/mods/muxcle-space-closer/adapter.js", "mods/muxcle-space-closer/adapter.js"],
    [".build/mods/muxcle-space-closer/controller.js", "mods/muxcle-space-closer/controller.js"],
    [".build/mods/muxcle-space-closer/main.js", "mods/muxcle-space-closer/main.js"],
    [".build/mods/muxcle-space-closer/model.js", "mods/muxcle-space-closer/model.js"],
    ["mods/muxcle-space-closer/mod.json", "mods/muxcle-space-closer/mod.json"],
    ["mods/muxcle-space-closer/package-owner.json", "mods/muxcle-space-closer/package-owner.json"],
  ],
};
const existingPackageDefinitions = [
  appPackage,
  tmuxKeysPackage,
  sessionizerPackage,
  pickerPackage,
  historyPackage,
  rotationPackage,
  sizingPackage,
  repeatPackage,
  projectPopupPackage,
  copyModePackage,
  tabToolsPackage,
  spaceCloserPackage,
];
const trustedComponentNames = new Set(existingPackageDefinitions.filter(hasOwnedModSources).map(({ name }) => name));
const packPackage = createPackDefinition(existingPackageDefinitions);
const packageDefinitions = [...existingPackageDefinitions, packPackage];
const packagesByName = new Map(packageDefinitions.map((definition) => [definition.name, definition]));
export const RELEASE_CATALOG = Object.freeze(
  packageDefinitions.map(({ name, release }) => Object.freeze({ name, ...release })),
);

export async function createPackage(options = {}) {
  return buildPackage(appPackage, options);
}

export async function createTmuxKeysPackage(options = {}) {
  return buildPackage(tmuxKeysPackage, options);
}

export async function createSessionizerPackage(options = {}) {
  return buildPackage(sessionizerPackage, options);
}

export async function createPickerPackage(options = {}) {
  return buildPackage(pickerPackage, options);
}

export async function createHistoryPackage(options = {}) {
  return buildPackage(historyPackage, options);
}

export async function createRotationPackage(options = {}) {
  return buildPackage(rotationPackage, options);
}

export async function createSizingPackage(options = {}) {
  return buildPackage(sizingPackage, options);
}

export async function createRepeatPackage(options = {}) {
  return buildPackage(repeatPackage, options);
}

export async function createProjectPopupPackage(options = {}) {
  return buildPackage(projectPopupPackage, options);
}

export async function createCopyModePackage(options = {}) {
  return buildPackage(copyModePackage, options);
}

export async function createTabToolsPackage(options = {}) {
  return buildPackage(tabToolsPackage, options);
}

export async function createSpaceCloserPackage(options = {}) {
  return buildPackage(spaceCloserPackage, options);
}

export async function createPackPackage(options = {}) {
  return buildPackage(packPackage, options);
}

export async function createPackages(options = {}) {
  const results = [];
  for (const definition of packageDefinitions) results.push(await buildPackage(definition, options));
  return results;
}

export async function createModPackage(modName, options = {}) {
  if (typeof modName !== "string" || !/^[a-z0-9][a-z0-9-]*$/.test(modName)) {
    throw new Error(`invalid mod name: ${modName}`);
  }
  const target = `mods/${modName}/main.js`;
  const definition = existingPackageDefinitions.find(({ sources }) =>
    sources.some(([, destination]) => destination === target),
  );
  if (!definition) throw new Error(`no standalone package contains mod ${modName}`);
  return buildPackage(definition, options);
}

export function combinePackKeymaps(snippets) {
  const merged = {};
  const chordOwners = new Map();

  for (const { packageName, keymap } of snippets) {
    if (typeof packageName !== "string" || packageName.length === 0) {
      throw new TypeError("pack key snippets require a package name");
    }
    validatePackKeymap(packageName, keymap);
    for (const [section, bindings] of Object.entries(keymap)) {
      if (!merged[section]) {
        Object.defineProperty(merged, section, {
          value: {},
          enumerable: true,
          configurable: true,
          writable: true,
        });
      }
      for (const [chord, action] of Object.entries(bindings)) {
        const previousOwner = chordOwners.get(chord);
        if (previousOwner) {
          throw new Error(`shortcut collision for ${section}.${chord}: ${previousOwner} and ${packageName}`);
        }
        chordOwners.set(chord, packageName);
        Object.defineProperty(merged[section], chord, {
          value: action,
          enumerable: true,
          configurable: true,
          writable: true,
        });
      }
    }
  }

  return merged;
}

function validatePackKeymap(packageName, keymap) {
  if (!keymap || typeof keymap !== "object" || Array.isArray(keymap)) {
    throw new TypeError(`${packageName} key snippet must be a JSON object`);
  }
  for (const [section, bindings] of Object.entries(keymap)) {
    if (section !== "global" && section !== "terminal") {
      throw new TypeError(`${packageName} key snippet has unsupported section: ${section}`);
    }
    if (!bindings || typeof bindings !== "object" || Array.isArray(bindings)) {
      throw new TypeError(`${packageName} key section ${section} must be an object`);
    }
    for (const [chord, action] of Object.entries(bindings)) {
      if (!chord.trim()) throw new TypeError(`${packageName} key section ${section} has an empty chord`);
      if (typeof action === "string" && action.trim()) continue;
      if (
        action &&
        typeof action === "object" &&
        !Array.isArray(action) &&
        typeof action.command === "string" &&
        action.command.trim() &&
        (action.args === undefined ||
          (action.args && typeof action.args === "object" && !Array.isArray(action.args))) &&
        Object.keys(action).every((key) => key === "command" || key === "args")
      ) {
        continue;
      }
      throw new TypeError(`${packageName} key section ${section} chord ${chord} has an invalid action`);
    }
  }
}

export function assertNoSourceCollisions(sources) {
  const targets = new Map();
  for (const [source, target] of sources) {
    if (
      typeof target !== "string" ||
      target.startsWith("/") ||
      target.includes("\\") ||
      target.split("/").some((part) => !part || part === "." || part === "..")
    ) {
      throw new Error(`invalid archive target: ${target}`);
    }
    const existingSource = targets.get(target);
    if (targets.has(target)) {
      throw new Error(`archive target collision for ${target}: ${existingSource} and ${source}`);
    }
    targets.set(target, source);
  }
}

export function createPackLayout(baseLayout, hostBlocks) {
  if (!baseLayout || typeof baseLayout !== "object" || Array.isArray(baseLayout)) {
    throw new TypeError("pack layout source must be an object");
  }
  const layout = cloneJson(baseLayout);
  removeModNodes(layout, "muxcle-compat");

  const expectedHostMods = ["muxcle-history", "muxcle-rotation", "muxcle-sizing", "muxcle-tab-tools"];
  const suppliedHostMods = hostBlocks.map((block) => block?.content?.mod);
  if (
    hostBlocks.length !== expectedHostMods.length ||
    [...suppliedHostMods].sort().join("\n") !== [...expectedHostMods].sort().join("\n")
  ) {
    throw new Error("pack layout requires one source block for History, Rotation, Sizing, and Tab tools");
  }

  const nodes = collectLayoutNodes(layout);
  const workspaceNodes = nodes.filter((node) => node.id === "workspace");
  if (workspaceNodes.length !== 1 || !Array.isArray(workspaceNodes[0].children)) {
    throw new Error("pack layout source must contain one workspace node with children");
  }
  const existingIds = new Set();
  for (const node of nodes) {
    if (typeof node.id !== "string" || node.id.length === 0) continue;
    if (existingIds.has(node.id)) throw new Error(`pack layout source has duplicate node ID: ${node.id}`);
    existingIds.add(node.id);
  }
  for (const block of hostBlocks) {
    if (!block || block.type !== "block" || typeof block.id !== "string" || !block.id) {
      throw new Error("pack layout host blocks must have a block type and node ID");
    }
    if (existingIds.has(block.id)) throw new Error(`pack layout host node ID collides: ${block.id}`);
    existingIds.add(block.id);
  }

  const existingHostMods = nodes.filter((node) => expectedHostMods.includes(node.content?.mod));
  if (existingHostMods.length > 0) throw new Error("pack layout source already contains a pack host block");
  workspaceNodes[0].children.push(...hostBlocks.map(cloneJson));

  const finalNodes = collectLayoutNodes(layout);
  for (const modName of expectedHostMods) {
    if (finalNodes.filter((node) => node.content?.mod === modName).length !== 1) {
      throw new Error(`pack layout must contain exactly one ${modName} host`);
    }
  }
  if (finalNodes.some((node) => node.content?.mod === "muxcle-compat")) {
    throw new Error("pack layout must not display the scaffold compatibility status");
  }
  return layout;
}

function createPackDefinition(definitions) {
  const sources = createPackSources(definitions);
  const generatedFiles = [
    ["keys.json", (root) => readPackKeymap(root, definitions)],
    ["layouts/muxcle-pack.json", (root) => readPackLayout(root, definitions)],
  ];
  const allEntries = [...sources, ...generatedFiles.map(([target]) => ["<generated>", target])];
  assertNoSourceCollisions(allEntries);
  const files = allEntries.map(([, target]) => target);

  return {
    name: "muxcle-pack",
    release: {
      title: "Whole pack",
      summary: "Optional vendor-managed Muxcle collection for dotfiles; no installer or automatic activation.",
      installationPath: "packages/pack/RECIPE.md",
    },
    files,
    directories: listPackageDirectories(files),
    sources,
    generatedFiles,
  };
}

function createPackSources(definitions) {
  const componentSources = definitions.flatMap((definition) => {
    const resources = definition.sources
      .filter(([, target]) => !target.startsWith("mods/") && target !== "RECIPE.md" && target !== "layouts/muxcle.json")
      .map(([source, target]) => [source, `components/${definition.name}/${target}`]);
    return resources;
  });
  const scaffoldSources = appPackage.sources
    .filter(([, target]) => target !== "RECIPE.md")
    .map(([source, target]) => [source, `scaffold/${target}`]);
  const runtimeModSources = definitions
    .filter(hasOwnedModSources)
    .flatMap((definition) => definition.sources.filter(([, target]) => target.startsWith("mods/")));
  const sessionizer = definitions.find((definition) => definition.name === "muxcle-sessionizer");
  const sessionizerConfig = findSource(sessionizer, "config.example.json");

  return [
    ["packages/pack/RECIPE.md", "RECIPE.md"],
    [sessionizerConfig[0], "config.example.json"],
    ...componentSources,
    ...scaffoldSources,
    ...runtimeModSources,
  ];
}

async function readPackKeymap(root, definitions) {
  const snippets = [];
  for (const definition of definitions) {
    const source = definition.sources.find(([, target]) => target === "keys.json");
    if (!source) continue;
    const keymap = JSON.parse(await readFile(join(root, source[0]), "utf8"));
    snippets.push({ packageName: definition.name, keymap });
  }
  return `${JSON.stringify(combinePackKeymaps(snippets), null, 2)}\n`;
}

async function readPackLayout(root, definitions) {
  const baseLayout = JSON.parse(await readFile(join(root, "layouts/muxcle.json"), "utf8"));
  const history = definitions.find((definition) => definition.name === "muxcle-history");
  const rotation = definitions.find((definition) => definition.name === "muxcle-rotation");
  const sizing = definitions.find((definition) => definition.name === "muxcle-sizing");
  const tabTools = definitions.find((definition) => definition.name === "muxcle-tab-tools");
  const hostBlocks = await Promise.all(
    [
      [history, "observer.json"],
      [rotation, "host.json"],
      [sizing, "host.json"],
      [tabTools, "host.json"],
    ].map(async ([definition, target]) => {
      const source = findSource(definition, target);
      return JSON.parse(await readFile(join(root, source[0]), "utf8"));
    }),
  );
  return `${JSON.stringify(createPackLayout(baseLayout, hostBlocks), null, 2)}\n`;
}

function hasOwnedModSources(definition) {
  return definition.sources.some(([, target]) => target.startsWith("mods/") && target.endsWith("/package-owner.json"));
}

function findSource(definition, target) {
  const source = definition?.sources.find(([, sourceTarget]) => sourceTarget === target);
  if (!source) throw new Error(`package ${definition?.name ?? "unknown"} has no source for ${target}`);
  return source;
}

function listPackageDirectories(files) {
  const directories = new Set([""]);
  for (const file of files) {
    const segments = file.split("/");
    for (let index = 1; index < segments.length; index += 1) {
      directories.add(segments.slice(0, index).join("/"));
    }
  }
  return [...directories];
}

function removeModNodes(node, modName) {
  if (!Array.isArray(node.children)) return;
  node.children = node.children.filter((child) => child?.content?.mod !== modName);
  for (const child of node.children) removeModNodes(child, modName);
}

function collectLayoutNodes(root) {
  const nodes = [];
  const visit = (node) => {
    if (!node || typeof node !== "object" || Array.isArray(node)) return;
    nodes.push(node);
    if (Array.isArray(node.children)) {
      for (const child of node.children) visit(child);
    }
  };
  visit(root);
  return nodes;
}

function cloneJson(value) {
  return JSON.parse(JSON.stringify(value));
}

async function buildPackage(
  definition,
  { repositoryRoot: root = repositoryRoot, outputDirectory = join(root, "dist") } = {},
) {
  assertNoSourceCollisions([
    ...definition.sources,
    ...(definition.generatedFiles ?? []).map(([target]) => ["<generated>", target]),
  ]);
  const packageMetadata = JSON.parse(await readFile(join(root, "package.json"), "utf8"));
  const version = packageMetadata.version;
  if (!/^\d+\.\d+\.\d+$/.test(version ?? "")) {
    throw new Error("package.json must define a stable semantic version");
  }

  const bundleName = `${definition.name}-v${version}`;
  const bundleDirectory = join(outputDirectory, bundleName);
  const archivePath = join(outputDirectory, `${bundleName}.tar.gz`);
  const checksumPath = `${archivePath}.sha256`;
  await mkdir(outputDirectory, { recursive: true });
  const temporaryDirectory = await mkdtemp(join(outputDirectory, ".package-"));
  const stagedDirectory = join(temporaryDirectory, bundleName);
  const stagedArchive = join(temporaryDirectory, basename(archivePath));
  const stagedChecksum = `${stagedArchive}.sha256`;
  await mkdir(stagedDirectory, { recursive: true });

  try {
    for (const [source, target] of definition.sources) {
      const targetPath = join(stagedDirectory, target);
      await mkdir(dirname(targetPath), { recursive: true });
      if (target.endsWith("/package-owner.json")) {
        const owner = JSON.parse(await readFile(join(root, source), "utf8"));
        const modName = target.split("/")[1];
        if (
          !owner ||
          !trustedComponentNames.has(owner.package) ||
          owner.package !== modName ||
          owner.schema !== 1 ||
          Object.keys(owner).length !== 2
        ) {
          throw new Error(`Unexpected package ownership marker: ${source}`);
        }
        await writeFile(targetPath, `${JSON.stringify({ package: owner.package, schema: 1 })}\n`);
      } else {
        await copyFile(join(root, source), targetPath);
      }
    }

    for (const [target, generate] of definition.generatedFiles ?? []) {
      const targetPath = join(stagedDirectory, target);
      await mkdir(dirname(targetPath), { recursive: true });
      await writeFile(targetPath, await generate(root));
    }

    const manifest = {
      name: definition.name,
      version,
      testedHerdrAppVersion: "0.1.13",
      files: [...definition.files, "manifest.json"].sort(),
    };
    await writeFile(join(stagedDirectory, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);
    await createDeterministicArchive({
      packageDirectory: stagedDirectory,
      archivePath: stagedArchive,
      packageName: definition.name,
    });
    const digest = await sha256(stagedArchive);
    await writeFile(stagedChecksum, `${digest}  ${basename(archivePath)}\n`);
    verifyPackage({ outputDirectory: temporaryDirectory, version, packageName: definition.name });

    await rm(bundleDirectory, { recursive: true, force: true });
    await rm(archivePath, { force: true });
    await rm(checksumPath, { force: true });
    await rename(stagedDirectory, bundleDirectory);
    await rename(stagedArchive, archivePath);
    await rename(stagedChecksum, checksumPath);
    return { name: definition.name, version, bundleDirectory, archivePath, checksumPath };
  } finally {
    await rm(temporaryDirectory, { recursive: true, force: true });
  }
}

export async function createDeterministicArchive({ packageDirectory, archivePath, packageName = appPackage.name }) {
  const definition = getPackageDefinition(packageName);
  const bundleName = basename(packageDirectory);
  await normalizePackageTree(packageDirectory);

  const files = [...definition.files, "manifest.json"].map((path) => `${bundleName}/${path}`);
  const directories = definition.directories.map((path) => (path ? `${bundleName}/${path}/` : `${bundleName}/`));
  const entries = [...files, ...directories].sort();
  const tarVersion = execFileSync("tar", ["--version"], { encoding: "utf8" });
  const ownership = tarVersion.includes("GNU tar")
    ? ["--owner=root:0", "--group=root:0"]
    : ["--uid=0", "--gid=0", "--uname=root", "--gname=root"];

  const tarBytes = execFileSync("tar", [
    "-cf",
    "-",
    "--format=ustar",
    ...ownership,
    "--no-recursion",
    "-C",
    dirname(packageDirectory),
    ...entries,
  ]);
  const compressed = execFileSync("gzip", ["-n", "-c"], { input: tarBytes });
  await writeFile(archivePath, compressed);
}

async function normalizePackageTree(directory) {
  const fixedTime = new Date("2000-01-01T00:00:00.000Z");
  const entries = await readdir(directory, { withFileTypes: true });
  for (const entry of entries) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) await normalizePackageTree(path);
    else if (!entry.isFile()) throw new Error(`unsupported package entry: ${path}`);
    await chmod(path, entry.isDirectory() ? 0o755 : 0o644);
    await utimes(path, fixedTime, fixedTime);
  }
  await chmod(directory, 0o755);
  await utimes(directory, fixedTime, fixedTime);
}

export function verifyPackage({
  outputDirectory = join(repositoryRoot, "dist"),
  version,
  packageName = appPackage.name,
}) {
  if (!version) throw new Error("package version is required");
  const definition = getPackageDefinition(packageName);
  const bundleName = `${definition.name}-v${version}`;
  const archivePath = join(outputDirectory, `${bundleName}.tar.gz`);
  const checksumPath = `${archivePath}.sha256`;
  const entries = execFileSync("tar", ["-tzf", archivePath], { encoding: "utf8" })
    .trim()
    .split("\n")
    .map((rawPath) => ({
      path: rawPath.replace(/\/$/, ""),
      directory: rawPath.endsWith("/"),
    }));
  const prefix = `${bundleName}/`;
  const files = entries
    .filter((entry) => !entry.directory)
    .map((entry) => {
      if (!entry.path.startsWith(prefix)) throw new Error("archive contains an unexpected top-level path");
      return entry.path.slice(prefix.length);
    })
    .sort();
  const directories = entries
    .filter((entry) => entry.directory)
    .map((entry) => {
      if (!entry.path.startsWith(bundleName)) throw new Error("archive contains an unexpected directory");
      return entry.path.slice(bundleName.length).replace(/^\//, "");
    })
    .sort();
  const expectedFiles = [...definition.files, "manifest.json"].sort();
  const expectedDirectories = [...definition.directories].sort();
  const expectedEntries = [
    ...expectedFiles.map((path) => `${bundleName}/${path}`),
    ...expectedDirectories.map((path) => (path ? `${bundleName}/${path}/` : `${bundleName}/`)),
  ].sort();
  const actualEntries = entries.map((entry) => `${entry.path}${entry.directory ? "/" : ""}`);
  if (
    JSON.stringify(actualEntries) !== JSON.stringify(expectedEntries) ||
    JSON.stringify(files) !== JSON.stringify(expectedFiles) ||
    JSON.stringify(directories) !== JSON.stringify(expectedDirectories)
  ) {
    throw new Error(`unexpected package contents: ${files.join(", ")}`);
  }

  const manifest = JSON.parse(
    execFileSync("tar", ["-xOf", archivePath, `${bundleName}/manifest.json`], { encoding: "utf8" }),
  );
  if (
    manifest.name !== definition.name ||
    manifest.version !== version ||
    JSON.stringify(manifest.files) !== JSON.stringify(expectedFiles)
  ) {
    throw new Error("package manifest does not match the package contents");
  }

  const checksum = readFileSync(checksumPath, "utf8").trim();
  const expectedChecksum = `${sha256Sync(archivePath)}  ${basename(archivePath)}`;
  if (checksum !== expectedChecksum) throw new Error("package checksum does not match the archive");
  return { name: definition.name, version, files };
}

function getPackageDefinition(name) {
  const definition = packagesByName.get(name);
  if (!definition) throw new Error(`unknown package definition: ${name}`);
  return definition;
}

async function sha256(path) {
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(path)) hash.update(chunk);
  return hash.digest("hex");
}

function sha256Sync(path) {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  for (const result of await createPackages()) {
    const verified = verifyPackage({ version: result.version, packageName: result.name });
    console.log(`Packaged ${result.archivePath}`);
    console.log(`${verified.files.length - 1} payload files; SHA-256 written to ${result.checksumPath}`);
  }
}
