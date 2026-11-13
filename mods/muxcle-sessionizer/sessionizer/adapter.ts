import type { SessionizerAdapter } from "./controller.js";
import {
  isSafeHomeRelativeRoot,
  MAX_MACHINES,
  parseProjectDiscovery,
  projectKey,
  SessionizerError,
  type SessionizerConfig,
  type SpaceReference,
} from "./model.js";
import { refreshProjects, restoreProjectCache, type CachedProjectSet, type ConnectedMachine } from "./discovery.js";

const MAX_HELPER_INPUT_BYTES = 96 * 1024;
const MAX_HELPER_OUTPUT_CHARS = 512 * 1024;
const MAX_LOCAL_SPACES = 256;
const MAX_PATH_CHARS = 4_096;
const CACHE_KEY = "muxcle-sessionizer.projects.v2";

export interface NativeExecResult {
  code: number;
  stdout: string;
  stderr: string;
}

export interface NativeSessionizerApi {
  readTextFile(path: string): Promise<string | null>;
  exec(command: string, args: string[], options: { cwd: string; timeout?: number }): Promise<NativeExecResult>;
  spaces(): readonly SpaceReference[];
  home(): string;
  shared(key: string): unknown;
  setShared(key: string, value: unknown): null;
  run(name: string, args?: Record<string, unknown>): null;
  closeOverlay(id: string): null;
}

export function createSessionizerAdapter(
  api: NativeSessionizerApi,
  configPath: string,
  helperDirectory: string,
  overlayId?: string,
): SessionizerAdapter {
  return {
    readConfig: () => api.readTextFile(configPath),
    discover: async (config, publish) => {
      const cache = restoreProjectCache(api.shared(CACHE_KEY));
      const localRoots = combineRoots(config.roots, homeRootSpecs(config.homeRoots));
      const compatibleCache = cache.filter((entry) => {
        const configuredRoots = entry.machine === null ? localRoots : configuredRemoteRoots(config, entry.machine);
        return configuredRoots !== undefined && sameRoots(configuredRoots, entry.roots);
      });
      publish({
        projects: compatibleCache.flatMap((entry) => parseCachedProjects(entry, true)),
        warnings: ["Loading cached projects and checking configured roots…"],
        truncated: compatibleCache.some((entry) => entry.truncated),
        loading: true,
      });

      let connected: ConnectedMachine[] = [];
      let machineWarning: string | null = null;
      if (Object.keys(config.remoteRoots).length > 0 || config.connectedHomeRoots.length > 0) {
        try {
          connected = await listConnectedMachines(api, helperDirectory);
        } catch {
          machineWarning =
            "Could not verify connected machines; check hc machine ls. Remote cache is stale and cannot be opened.";
        }
      }
      const remote = buildRemoteRoots(config, connected, compatibleCache);
      const machineWarnings = [
        ...(machineWarning ? [machineWarning] : []),
        ...(remote.omitted > 0
          ? [`Only 12 remote machines are scanned; ${remote.omitted} additional machine(s) were omitted.`]
          : []),
      ];
      await refreshProjects({
        cache: compatibleCache,
        roots: { "": localRoots, ...remote.roots },
        connectedMachines: connected,
        scan: async (machine, machineRoots) => {
          const mode = machine === null ? "discover" : "remote";
          const args =
            machine === null
              ? ["-B", "discover.py", mode, JSON.stringify(machineRoots)]
              : ["-B", "discover.py", mode, machine, JSON.stringify(machineRoots)];
          const raw = await runHelper(api, helperDirectory, args);
          const parsed = parseProjectDiscovery(raw);
          return {
            projects: parsed.projects.map(({ name, path }) => ({ name, path })),
            warnings: parsed.warnings,
            truncated: parsed.truncated,
          };
        },
        publish: (state) =>
          publish(
            machineWarnings.length > 0
              ? {
                  ...state,
                  warnings: [...state.warnings, ...machineWarnings],
                  projects: machineWarning
                    ? state.projects.map((project) =>
                        project.machine === null ? project : { ...project, stale: true },
                      )
                    : state.projects,
                }
              : state,
          ),
        persist: (entry) => persistCache(api, entry),
      });
    },
    spaces: () => api.spaces().map(({ id, folder, machine, active }) => ({ id, folder, machine, active })),
    connectedMachines: () => listConnectedMachines(api, helperDirectory),
    findSpace: async (folder, machine, spaces) => {
      const scopedSpaces = spaces.filter((space) => space.machine === machine);
      if (scopedSpaces.length > MAX_LOCAL_SPACES) {
        throw new SessionizerError(
          "There are too many spaces on this machine to compare safely. No new space was created.",
        );
      }
      if (folder.length > MAX_PATH_CHARS) {
        throw new SessionizerError("That project folder is too long to compare safely. No new space was created.");
      }
      const normalizedSpaces = scopedSpaces.map((space) => {
        if (typeof space.folder !== "string" || space.folder.length > MAX_PATH_CHARS || space.folder.includes("\0")) {
          throw new SessionizerError(
            "A space folder is unavailable or too long to compare safely. No new space was created.",
          );
        }
        const spaceFolder = space.folder === "" && machine === null ? api.home() : space.folder;
        if ((!spaceFolder && machine === null) || spaceFolder.length > MAX_PATH_CHARS) {
          throw new SessionizerError(
            "A space folder is unavailable or too long to compare safely. No new space was created.",
          );
        }
        return { id: space.id, folder: spaceFolder, active: space.active };
      });
      const payload = JSON.stringify({ folder, spaces: normalizedSpaces });
      const args =
        machine === null
          ? ["-B", "discover.py", "match", payload]
          : ["-B", "discover.py", "remote-match", machine, payload];
      return runHelper(api, helperDirectory, args);
    },
    selectSpace: (id) => api.run("space.select", { id }),
    createSpace: (folder, machine) => api.run("space.new", { folder, machine: machine ?? "" }),
    close: () => {
      if (overlayId) api.closeOverlay(overlayId);
    },
  };
}

async function listConnectedMachines(api: NativeSessionizerApi, directory: string): Promise<ConnectedMachine[]> {
  const raw = await runHelper(api, directory, ["-B", "discover.py", "machines"]);
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    throw new SessionizerError("Invalid machine list.");
  }
  if (
    !isRecord(value) ||
    !Array.isArray(value.machines) ||
    value.machines.length > 256 ||
    !value.machines.every((machine) => isRecord(machine) && validMachine(machine.id) && validMachine(machine.name))
  ) {
    throw new SessionizerError("Invalid machine list.");
  }
  const machines = value.machines as ConnectedMachine[];
  if (
    new Set(machines.map(({ id }) => id)).size !== machines.length ||
    new Set(machines.map(({ name }) => name)).size !== machines.length
  ) {
    throw new SessionizerError("Duplicate native machine identity in machine list.");
  }
  return machines;
}

function homeRootSpecs(roots: readonly string[]): string[] {
  return roots.map((root) => {
    if (!isSafeHomeRelativeRoot(root)) throw new SessionizerError("Invalid home-relative project root.");
    return `~/${root}`;
  });
}

function configuredRemoteRoots(config: SessionizerConfig, machine: string): string[] | undefined {
  const roots = combineRoots(config.remoteRoots[machine] ?? [], homeRootSpecs(config.connectedHomeRoots));
  return roots.length > 0 ? roots : undefined;
}

function buildRemoteRoots(
  config: SessionizerConfig,
  connected: readonly ConnectedMachine[],
  cache: readonly CachedProjectSet[],
): { roots: Record<string, string[]>; omitted: number } {
  const configuredNames = Object.keys(config.remoteRoots).sort();
  const connectedNames = config.connectedHomeRoots.length > 0 ? connected.map(({ name }) => name).sort() : [];
  const cachedNames =
    config.connectedHomeRoots.length > 0
      ? cache.flatMap((entry) => (entry.machine === null ? [] : [entry.machine])).sort()
      : [];
  const requestedNames = [...new Set([...configuredNames, ...connectedNames, ...cachedNames])];
  const selectedNames = requestedNames.slice(0, MAX_MACHINES);
  const roots = Object.create(null) as Record<string, string[]>;
  for (const name of selectedNames) roots[name] = configuredRemoteRoots(config, name) ?? [];
  return { roots, omitted: requestedNames.length - selectedNames.length };
}

function combineRoots(...groups: readonly (readonly string[])[]): string[] {
  return [...new Set(groups.flatMap((group) => [...group]))];
}

function sameRoots(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((root, index) => root === right[index]);
}

function parseCachedProjects(entry: CachedProjectSet, stale: boolean) {
  return entry.projects.map(({ name, path }) => ({
    key: projectKey(entry.machineId, entry.machine, path),
    name,
    path,
    machine: entry.machine,
    machineId: entry.machineId,
    stale,
  }));
}

function persistCache(api: NativeSessionizerApi, entry: CachedProjectSet): void {
  const current = restoreProjectCache(api.shared(CACHE_KEY));
  const key = entry.machineId ?? "local";
  const entries = [...current.filter((cached) => (cached.machineId ?? "local") !== key), entry].slice(-13);
  while (entries.length > 0 && utf8Length(JSON.stringify({ version: 2, entries })) > 512 * 1024) entries.shift();
  if (entries.length > 0) api.setShared(CACHE_KEY, { version: 2, entries });
}

async function runHelper(api: NativeSessionizerApi, directory: string, args: string[]): Promise<string> {
  const payload = args.at(-1) ?? "";
  if (utf8Length(payload) > MAX_HELPER_INPUT_BYTES)
    throw new SessionizerError("Project data is too large to process safely.");
  let result: NativeExecResult;
  try {
    result = await api.exec("python3", args, { cwd: directory, timeout: 10_000 });
  } catch {
    throw new SessionizerError("Python 3 could not start. Install Python 3 and reopen the picker.");
  }
  if (result.code !== 0) {
    const remote = ["remote", "remote-match"].includes(args[2] ?? "");
    throw new SessionizerError(
      remote
        ? "Remote discovery failed. Check `hc machine ls`, `hc exec --help`, and Python 3 on that machine."
        : "Project discovery failed. Check the configured roots and local Python 3 installation.",
    );
  }
  if (result.stdout.length > MAX_HELPER_OUTPUT_CHARS) {
    throw new SessionizerError("Project discovery returned too much data. Narrow the configured roots.");
  }
  return result.stdout;
}

function validMachine(value: unknown): value is string {
  return typeof value === "string" && value.length > 0 && value.length <= 256 && !/[\u0000-\u001f\u007f]/.test(value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function utf8Length(value: string): number {
  let length = 0;
  for (const character of value) {
    const codePoint = character.codePointAt(0) ?? 0;
    length += codePoint <= 0x7f ? 1 : codePoint <= 0x7ff ? 2 : codePoint <= 0xffff ? 3 : 4;
  }
  return length;
}
