export type TerminalState = "idle" | "running" | "passed" | "failed" | "cancelled";

export type MonitorState =
  | TerminalState
  | "loading"
  | "no-project"
  | "remote-disabled"
  | "offline"
  | "unsupported"
  | "invalid"
  | "restarting"
  | "limit";

export interface ProjectIdentity {
  machine: string | null;
  /** Empty means the target machine's home directory. */
  folder: string;
}

export interface StatusSnapshot {
  generation: number;
  state: TerminalState;
  failures: number;
}

export interface MonitorValue {
  state: MonitorState;
  generation?: number;
  failures?: number;
}

export interface WatcherCursor {
  instance: string;
  generation: number;
  state: TerminalState;
  lastNotifiedGeneration: number | null;
}

export interface CursorObservation {
  cursor: WatcherCursor;
  notify: boolean;
  invalid: boolean;
}

export type ParseResult<T> = { kind: "ok"; value: T } | { kind: "unsupported" } | { kind: "invalid" };

export const CONTROL_SCHEMA_VERSION = 1;
export const MAX_PROJECTS = 64;
export const MAX_FOLDER_LENGTH = 4096;
export const MAX_MACHINE_LENGTH = 256;
export const MAX_INSTANCE_LENGTH = 256;
export const MAX_JSON_LENGTH = 1_048_576;
export const MAX_NOTIFICATION_LABEL_LENGTH = 96;
export const MAX_STATUS_TIMEOUT_MS = 10_000;
export const MAX_CONCURRENT_PROJECTS = 4;
export const PERSISTED_CURSOR_KEY = "muxcle.funzzy-status.v1";

const TERMINAL_STATES = new Set<TerminalState>(["passed", "failed"]);
const STATES = new Set<TerminalState>(["idle", "running", "passed", "failed", "cancelled"]);

export function projectKey(identity: ProjectIdentity): string {
  return JSON.stringify([identity.machine, identity.folder]);
}

export function validIdentity(value: unknown): value is ProjectIdentity {
  if (!value || typeof value !== "object") return false;
  const identity = value as Partial<ProjectIdentity>;
  return (
    (identity.machine === null ||
      (typeof identity.machine === "string" &&
        identity.machine.length > 0 &&
        identity.machine.length <= MAX_MACHINE_LENGTH)) &&
    typeof identity.folder === "string" &&
    identity.folder.length <= MAX_FOLDER_LENGTH
  );
}

export function layoutHasMod(value: unknown, modName: string): boolean {
  if (Array.isArray(value)) return value.some((item) => layoutHasMod(item, modName));
  if (!isRecord(value)) return false;

  if (isRecord(value.content) && value.content.mod === modName) return true;
  return Array.isArray(value.children) && value.children.some((child) => layoutHasMod(child, modName));
}

export function watcherBinary(binary: unknown, localHome: string): string {
  const value = typeof binary === "string" && binary.trim() ? binary.trim() : "fzz";
  return value.startsWith("~/") ? `${localHome}/${value.slice(2)}` : value;
}

export function projectLabel(identity: ProjectIdentity): string {
  const safePart = (value: string, fallback: string) =>
    value
      .replace(/[\u0000-\u001f\u007f]/g, "")
      .trim()
      .slice(0, 40) || fallback;
  const machine = safePart(identity.machine ?? "local", "local");
  const folderParts = identity.folder.split(/[\\/]+/).filter(Boolean);
  const folder = safePart(folderParts.at(-1) ?? (identity.folder ? "root" : "home"), "project");
  return `${machine} · ${folder}`.slice(0, MAX_NOTIFICATION_LABEL_LENGTH);
}

export function isUnsupportedCli(stderr: unknown): boolean {
  if (typeof stderr !== "string") return false;
  const message = stderr.slice(0, 4096).toLowerCase();
  return (
    /\b(?:unknown|unrecognized|unexpected|unsupported)\s+(?:subcommand|command|argument|option|flag)\b/.test(message) ||
    /\b(?:subcommand|command|argument|option|flag)\b.{0,120}\b(?:unknown|unrecognized|unexpected|unsupported)\b/.test(
      message,
    ) ||
    /\binvalid choice\b/.test(message) ||
    /\bfound argument\b.{0,120}\b(?:wasn.t|was not) expected\b/.test(message)
  );
}

export function statusColor(state: string, theme: Record<string, string>): string {
  if (state === "running") return theme.ansi4 ?? theme.muted ?? "";
  if (state === "passed") return theme.ansi2 ?? theme.muted ?? "";
  if (state === "failed") return theme.ansi1 ?? theme.muted ?? "";
  return theme.muted ?? "";
}

function parseBoundedJson(text: unknown): ParseResult<unknown> {
  if (typeof text !== "string" || text.length === 0 || text.length > MAX_JSON_LENGTH) {
    return { kind: "invalid" };
  }
  try {
    return { kind: "ok", value: JSON.parse(text) as unknown };
  } catch {
    return { kind: "invalid" };
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

export function parseCapabilities(text: unknown): ParseResult<{ instance: string }> {
  const parsed = parseBoundedJson(text);
  if (parsed.kind !== "ok") return parsed;
  if (!isRecord(parsed.value)) return { kind: "invalid" };

  const { schemaVersion, methods, instance } = parsed.value;
  if (
    schemaVersion !== undefined &&
    (!Number.isSafeInteger(schemaVersion) || typeof schemaVersion !== "number" || schemaVersion < 0)
  ) {
    return { kind: "invalid" };
  }
  if (methods !== undefined && (!Array.isArray(methods) || methods.some((method) => typeof method !== "string"))) {
    return { kind: "invalid" };
  }
  if (
    !isRecord(instance) ||
    typeof instance.token !== "string" ||
    instance.token.trim().length === 0 ||
    instance.token.length > MAX_INSTANCE_LENGTH
  ) {
    return { kind: "invalid" };
  }

  if (schemaVersion !== CONTROL_SCHEMA_VERSION || !Array.isArray(methods) || !methods.includes("status")) {
    return { kind: "unsupported" };
  }
  return { kind: "ok", value: { instance: instance.token } };
}

export function parseStatus(text: unknown): ParseResult<StatusSnapshot> {
  const parsed = parseBoundedJson(text);
  if (parsed.kind !== "ok") return { kind: "invalid" };
  if (!isRecord(parsed.value)) return { kind: "invalid" };

  const { generation, state, failures } = parsed.value;
  if (
    !Number.isSafeInteger(generation) ||
    typeof generation !== "number" ||
    generation < 0 ||
    typeof state !== "string" ||
    !STATES.has(state as TerminalState) ||
    !Array.isArray(failures) ||
    failures.some((failure) => typeof failure !== "string")
  ) {
    return { kind: "invalid" };
  }

  return {
    kind: "ok",
    value: {
      generation,
      state: state as TerminalState,
      failures: failures.length,
    },
  };
}

function validCursor(value: unknown): value is WatcherCursor {
  if (!isRecord(value)) return false;
  return (
    typeof value.instance === "string" &&
    value.instance.trim().length > 0 &&
    value.instance.length <= MAX_INSTANCE_LENGTH &&
    Number.isSafeInteger(value.generation) &&
    typeof value.generation === "number" &&
    value.generation >= 0 &&
    typeof value.state === "string" &&
    STATES.has(value.state as TerminalState) &&
    (value.lastNotifiedGeneration === null ||
      (Number.isSafeInteger(value.lastNotifiedGeneration) &&
        typeof value.lastNotifiedGeneration === "number" &&
        value.lastNotifiedGeneration >= 0 &&
        value.lastNotifiedGeneration <= value.generation))
  );
}

function canonicalCursor(value: unknown): WatcherCursor | null {
  if (!validCursor(value)) return null;
  return {
    instance: value.instance,
    generation: value.generation,
    state: value.state,
    lastNotifiedGeneration: value.lastNotifiedGeneration,
  };
}

export function restoreCursors(value: unknown): Map<string, WatcherCursor> {
  if (!isRecord(value) || value.schema !== 1 || !Array.isArray(value.entries)) return new Map();

  const cursors = new Map<string, WatcherCursor>();
  const entries = value.entries;
  const start = Math.max(0, entries.length - MAX_PROJECTS);
  for (let index = start; index < entries.length; index += 1) {
    const entry: unknown = entries[index];
    if (!isRecord(entry) || !validIdentity(entry)) continue;
    const cursor = canonicalCursor(entry.cursor);
    if (cursor) cursors.set(projectKey(entry), cursor);
  }
  return cursors;
}

export function persistCursors(cursors: Map<string, WatcherCursor>): {
  schema: 1;
  entries: Array<ProjectIdentity & { cursor: WatcherCursor }>;
} {
  const entries: Array<ProjectIdentity & { cursor: WatcherCursor }> = [];
  for (const [key, cursor] of cursors) {
    let identity: unknown;
    try {
      identity = JSON.parse(key) as unknown;
    } catch {
      continue;
    }
    if (
      !validIdentity({
        machine: Array.isArray(identity) ? identity[0] : undefined,
        folder: Array.isArray(identity) ? identity[1] : undefined,
      })
    )
      continue;
    const [machine, folder] = identity as [string | null, string];
    const safeCursor = canonicalCursor(cursor);
    if (!safeCursor) continue;
    entries.push({ machine, folder, cursor: safeCursor });
  }
  return { schema: 1, entries: entries.slice(-MAX_PROJECTS) };
}

function baseline(snapshot: StatusSnapshot, instance: string): WatcherCursor {
  return {
    instance,
    generation: snapshot.generation,
    state: snapshot.state,
    lastNotifiedGeneration: TERMINAL_STATES.has(snapshot.state) ? snapshot.generation : null,
  };
}

export function observeSnapshot(
  previous: WatcherCursor | undefined,
  snapshot: StatusSnapshot,
  instance: string,
  suppressNotification: boolean,
): CursorObservation {
  if (!previous || previous.instance !== instance) {
    return { cursor: baseline(snapshot, instance), notify: false, invalid: false };
  }
  if (snapshot.generation < previous.generation) {
    return { cursor: previous, notify: false, invalid: true };
  }

  const shouldNotify =
    TERMINAL_STATES.has(snapshot.state) &&
    (previous.lastNotifiedGeneration === null || snapshot.generation > previous.lastNotifiedGeneration);
  const cursor: WatcherCursor = {
    instance,
    generation: snapshot.generation,
    state: snapshot.state,
    lastNotifiedGeneration:
      shouldNotify || (suppressNotification && TERMINAL_STATES.has(snapshot.state))
        ? snapshot.generation
        : previous.lastNotifiedGeneration,
  };

  return { cursor, notify: shouldNotify && !suppressNotification, invalid: false };
}
