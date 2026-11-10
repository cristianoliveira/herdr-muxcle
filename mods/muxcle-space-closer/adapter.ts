import type { ExecResult } from "herdr";
import type { CoreMachineInfo, MachineLayoutInfo, SpaceInfo } from "./model.js";
import type { SpaceCloserAdapter } from "./controller.js";

const MAX_MACHINE_LIST_CHARS = 256 * 1024;

export interface SpaceCloserNativeApi {
  spaces(): readonly SpaceInfo[];
  machines(): readonly MachineLayoutInfo[];
  hc(args: string[]): Promise<ExecResult>;
  run(name: string, args?: Record<string, unknown>): null;
}

export function createSpaceCloserAdapter(api: SpaceCloserNativeApi): SpaceCloserAdapter {
  return {
    spaces: () => api.spaces(),
    machines: () => api.machines(),
    coreMachines: async () => {
      const result = await api.hc(["machine", "ls", "--json"]);
      if (result.code !== 0) throw new Error("machine list unavailable");
      return parseCoreMachines(result.stdout);
    },
    closeSpace: (id) => {
      api.run("space.close", { id, confirmed: true });
    },
  };
}

export function parseCoreMachines(stdout: string): readonly CoreMachineInfo[] {
  if (typeof stdout !== "string" || stdout.length > MAX_MACHINE_LIST_CHARS) {
    throw new Error("machine list too large");
  }

  let payload: unknown;
  try {
    payload = JSON.parse(stdout);
  } catch {
    throw new Error("machine list invalid");
  }

  if (!isRecord(payload) || !Array.isArray(payload.machines)) {
    throw new Error("machine list invalid");
  }

  const names = new Set<string>();
  const result: CoreMachineInfo[] = [];
  for (const value of payload.machines) {
    if (
      !isRecord(value) ||
      !validText(value.id, 512) ||
      !validText(value.name, 256) ||
      !validText(value.state, 64) ||
      (value.temporary !== undefined && typeof value.temporary !== "boolean") ||
      names.has(value.name)
    ) {
      throw new Error("machine identity invalid");
    }
    names.add(value.name);
    result.push({
      id: value.id,
      name: value.name,
      state: value.state,
      ...(typeof value.temporary === "boolean" ? { temporary: value.temporary } : {}),
    });
  }
  return result;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function validText(value: unknown, maximum: number): value is string {
  return typeof value === "string" && value.length > 0 && value.length <= maximum && !value.includes("\0");
}
