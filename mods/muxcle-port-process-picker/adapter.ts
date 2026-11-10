import type { ExecResult } from "herdr";
import {
  localContext,
  MAX_SELECTED_PROCESS_COUNT,
  parseInventory,
  type ProcessEvidence,
  type ProcessSignalResult,
  type SignalKind,
  type SignalOutcome,
} from "./model.js";
import type { PortProcessPickerAdapter } from "./controller.js";

const MOD_NAME = "muxcle-port-process-picker";
const HELPER_TIMEOUT_MS = 15_000;
const SIGNAL_TIMEOUT_MS = 30_000;
const MAX_SIGNAL_PAYLOAD_CHARS = 64 * 1024;
const MAX_REPLY_CHARS = 512 * 1024;

export interface PortProcessNativeApi {
  appHome(): string;
  focused(): unknown;
  spaces(): unknown;
  panes(): unknown;
  layout(): unknown;
  exec(command: string, args: string[], options: { cwd?: string; on: null; timeout: number }): Promise<ExecResult>;
}

export function createPortProcessPickerAdapter(api: PortProcessNativeApi): PortProcessPickerAdapter {
  return {
    context: () => localContext(api.focused(), api.spaces(), api.panes(), api.layout()),
    scan: async () => {
      const result = await api.exec("python3", ["-I", "-S", helperPath(api.appHome()), "list"], {
        cwd: "/",
        on: null,
        timeout: HELPER_TIMEOUT_MS,
      });
      if (result.code !== 0) {
        throw new Error(`The packaged helper could not inventory local listeners: ${safeMessage(result.stderr)}.`);
      }
      return parseInventory(result.stdout);
    },
    signal: async (signal, reviewed) => {
      if (reviewed.length === 0 || reviewed.length > MAX_SELECTED_PROCESS_COUNT) {
        throw new Error("The reviewed process count is invalid.");
      }
      const reviewJson = JSON.stringify(reviewed);
      if (reviewJson.length > MAX_SIGNAL_PAYLOAD_CHARS)
        throw new Error("The reviewed process set exceeded its size limit.");
      const result = await api.exec(
        "python3",
        ["-I", "-S", helperPath(api.appHome()), "signal", "--kind", signal, "--review-json", reviewJson],
        { cwd: "/", on: null, timeout: SIGNAL_TIMEOUT_MS },
      );
      if (result.code !== 0) {
        throw new Error("The signal helper did not return a reliable result; some signals may have been sent.");
      }
      return parseSignalOutcome(result.stdout, signal, reviewed);
    },
  };
}

export function parseSignalOutcome(
  text: string,
  requestedSignal: SignalKind,
  reviewed: readonly ProcessEvidence[],
): SignalOutcome {
  if (typeof text !== "string" || text.length > MAX_REPLY_CHARS) {
    throw new Error("Signal helper response exceeded its size limit.");
  }

  let payload: unknown;
  try {
    payload = JSON.parse(text);
  } catch {
    throw new Error("Signal helper returned invalid JSON.");
  }
  if (
    !isRecord(payload) ||
    payload.schema !== 1 ||
    payload.signal !== requestedSignal ||
    !Array.isArray(payload.results)
  ) {
    throw new Error("Signal helper returned an unsupported response.");
  }
  if (payload.results.length !== reviewed.length) throw new Error("Signal helper returned an incomplete result set.");

  const expected = new Set(reviewed.map(({ pid }) => pid));
  const seen = new Set<number>();
  const results: ProcessSignalResult[] = payload.results.map((value) => {
    if (
      !isRecord(value) ||
      !Number.isSafeInteger(value.pid) ||
      !expected.has(value.pid as number) ||
      seen.has(value.pid as number) ||
      !isSignalStatus(value.status) ||
      (value.status === "sent" && value.signal !== requestedSignal) ||
      (value.message !== undefined && !validMessage(value.message))
    ) {
      throw new Error("Signal helper returned a mismatched process result.");
    }
    seen.add(value.pid as number);
    return Object.freeze({
      pid: value.pid as number,
      status: value.status,
      ...(typeof value.message === "string" ? { message: value.message } : {}),
    });
  });
  if (seen.size !== expected.size) throw new Error("Signal helper omitted a reviewed process.");
  return Object.freeze({ kind: "completed", signal: requestedSignal, results: Object.freeze(results) });
}

function helperPath(appHome: string): string {
  if (
    typeof appHome !== "string" ||
    !appHome.startsWith("/") ||
    appHome.startsWith("//") ||
    /[\u0000-\u001f\u007f]/u.test(appHome)
  ) {
    throw new Error("Herdr did not provide a safe absolute app-home path.");
  }
  return `${appHome.replace(/\/+$/u, "")}/mods/${MOD_NAME}/port_processes.py`;
}

function isSignalStatus(value: unknown): value is ProcessSignalResult["status"] {
  return value === "sent" || value === "stale" || value === "gone" || value === "denied" || value === "failed";
}

function validMessage(value: unknown): value is string {
  return typeof value === "string" && value.length <= 512 && !/[\u0000-\u001f\u007f]/u.test(value);
}

function safeMessage(value: unknown): string {
  if (typeof value !== "string" || value.length === 0) return "check that Python 3 and lsof are installed";
  return value.replace(/[\u0000-\u001f\u007f]/gu, " ").slice(0, 512);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
