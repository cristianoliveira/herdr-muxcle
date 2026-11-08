import type { SessionizerAdapter } from "./controller.js";
import { SessionizerError, type SpaceReference } from "./model.js";

const MAX_HELPER_INPUT_BYTES = 96 * 1024;
const MAX_HELPER_OUTPUT_CHARS = 512 * 1024;
const MAX_LOCAL_SPACES = 256;
const MAX_PATH_CHARS = 4_096;

export interface NativeExecResult {
  code: number;
  stdout: string;
  stderr: string;
}

export interface NativeSessionizerApi {
  readTextFile(path: string): Promise<string | null>;
  exec(command: string, args: string[], options: { cwd: string }): Promise<NativeExecResult>;
  spaces(): readonly SpaceReference[];
  home(): string;
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
    discover: (roots) => runHelper(api, helperDirectory, "discover", JSON.stringify(roots)),
    spaces: () => api.spaces().map(({ id, folder, machine, active }) => ({ id, folder, machine, active })),
    findLocalSpace: (folder, spaces) => {
      const localSpaces = spaces.filter((space) => space.machine === null);
      if (localSpaces.length > MAX_LOCAL_SPACES) {
        throw new SessionizerError("There are too many local spaces to compare safely. No new space was created.");
      }
      if (folder.length > MAX_PATH_CHARS) {
        throw new SessionizerError("That project folder is too long to compare safely. No new space was created.");
      }

      const normalizedSpaces = localSpaces.map((space) => {
        const spaceFolder = space.folder || api.home();
        if (spaceFolder.length > MAX_PATH_CHARS) {
          throw new SessionizerError("A local space folder is too long to compare safely. No new space was created.");
        }
        return { id: space.id, folder: spaceFolder, active: space.active };
      });
      const payload = JSON.stringify({ folder, spaces: normalizedSpaces });
      return runHelper(api, helperDirectory, "match", payload);
    },
    selectSpace: (id) => api.run("space.select", { id }),
    createLocalSpace: (folder) => api.run("space.new", { folder, machine: "" }),
    close: () => {
      if (overlayId) api.closeOverlay(overlayId);
    },
  };
}

async function runHelper(
  api: NativeSessionizerApi,
  directory: string,
  mode: "discover" | "match",
  payload: string,
): Promise<string> {
  if (utf8Length(payload) > MAX_HELPER_INPUT_BYTES) {
    throw new SessionizerError("Project data is too large to process safely.");
  }

  let result: NativeExecResult;
  try {
    result = await api.exec("python3", ["-B", "discover.py", mode, payload], { cwd: directory });
  } catch {
    throw new SessionizerError("Python 3 could not start. Install Python 3 and reopen the picker.");
  }
  if (result.code !== 0) {
    throw new SessionizerError("Project discovery failed. Check the configured roots and Python 3 installation.");
  }
  if (result.stdout.length > MAX_HELPER_OUTPUT_CHARS) {
    throw new SessionizerError("Project discovery returned too much data. Narrow the configured roots.");
  }
  return result.stdout;
}

function utf8Length(value: string): number {
  let length = 0;
  for (const character of value) {
    const codePoint = character.codePointAt(0) ?? 0;
    length += codePoint <= 0x7f ? 1 : codePoint <= 0x7ff ? 2 : codePoint <= 0xffff ? 3 : 4;
  }
  return length;
}
