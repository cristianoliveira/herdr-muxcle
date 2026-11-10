export type AgentStatus = "working" | "idle" | "done" | "blocked";
export type AttentionStatus = Extract<AgentStatus, "done" | "blocked">;
export type StatusFilter = "all" | AttentionStatus;

export interface AgentSnapshot {
  address: string;
  status: AgentStatus;
  seq: number;
  title?: string | null;
  space_name?: string | null;
  tab_name?: string | null;
}

export interface RememberedAgent {
  address: string;
  status: AgentStatus;
  title: string;
  space: string;
  tab: string;
}

export interface AttentionEvent extends Omit<RememberedAgent, "status"> {
  id: number;
  status: AttentionStatus;
}

export interface InboxState {
  schema: 1;
  serial: number;
  seen: RememberedAgent[];
  events: AttentionEvent[];
}

export interface LiveTerminal {
  address: string;
  state: string;
}

export type JumpCommand = ["agent.focus", { terminal: string }];

export const MAX_UNREAD_EVENTS = 100;
export const MAX_REMEMBERED_AGENTS = 1_000;
export const MAX_LABEL_LENGTH = 240;
const MAX_ADDRESS_LENGTH = 512;
const MAX_PERSISTED_CHARS = 3_000_000;
const STATUSES = new Set<AgentStatus>(["working", "idle", "done", "blocked"]);
const ATTENTION = new Set<AgentStatus>(["done", "blocked"]);
const STATUS_PRIORITY: Record<AgentStatus, number> = { blocked: 0, done: 1, working: 2, idle: 3 };

export function emptyState(): InboxState {
  return { schema: 1, serial: 0, seen: [], events: [] };
}

export function restoreState(raw: unknown): InboxState {
  const value = parsePersisted(raw);
  if (!isRecord(value) || value.schema !== 1 || !Array.isArray(value.seen) || !Array.isArray(value.events)) {
    return emptyState();
  }

  const events = restoreEvents(value.events);
  const serial =
    Number.isSafeInteger(value.serial) && (value.serial as number) >= (events[0]?.id ?? 0)
      ? (value.serial as number)
      : (events[0]?.id ?? 0);
  if (serial > Number.MAX_SAFE_INTEGER - MAX_REMEMBERED_AGENTS) return emptyState();

  return { schema: 1, serial, seen: restoreSeen(value.seen), events };
}

export function observeEvents(state: InboxState, reports: readonly AgentSnapshot[]): InboxState {
  const seen = new Map(state.seen.map((agent) => [agent.address, agent]));
  const current = reports.filter(isAgentSnapshot).map(normalizeAgent).sort(compareReports);
  const visited = new Set<string>();
  const incoming: AgentSnapshot[] = [];
  let changed = false;

  for (const agent of current) {
    if (visited.has(agent.address)) continue;
    if (visited.size >= MAX_REMEMBERED_AGENTS) break;
    visited.add(agent.address);

    const nextSeen = remember(agent);
    const previous = seen.get(agent.address);
    if (sameRememberedAgent(previous, nextSeen)) continue;

    seen.delete(agent.address);
    seen.set(agent.address, nextSeen);
    changed = true;
    if (previous?.status !== agent.status && ATTENTION.has(agent.status)) incoming.push(agent);
  }
  if (!changed) return state;

  for (const address of seen.keys()) {
    if (seen.size <= MAX_REMEMBERED_AGENTS) break;
    if (!visited.has(address)) seen.delete(address);
  }

  const events = incoming.map(
    (agent, index): AttentionEvent => ({
      ...remember(agent),
      id: state.serial + incoming.length - index,
      status: agent.status as AttentionStatus,
    }),
  );
  return {
    schema: 1,
    serial: state.serial + events.length,
    seen: [...seen.values()],
    events: [...events, ...state.events].slice(0, MAX_UNREAD_EVENTS),
  };
}

export function filterEvents(
  events: readonly AttentionEvent[],
  query: string,
  status: StatusFilter | string = "all",
): AttentionEvent[] {
  if (status !== "all" && status !== "done" && status !== "blocked") return [];
  const byStatus = status === "all" ? events : events.filter((event) => event.status === status);
  const terms = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  if (terms.length === 0) return [...byStatus];

  return byStatus.filter((event) => {
    const label = event.status === "blocked" ? "needs input" : "finished";
    const searchable = [event.title, event.space, event.tab, event.address, event.status, label]
      .join(" ")
      .toLowerCase();
    return terms.every((term) => searchable.includes(term));
  });
}

export function dismissEvent(state: InboxState, id: number): InboxState {
  return dismissEvents(state, [id]);
}

export function dismissEvents(state: InboxState, ids: readonly number[]): InboxState {
  const dismissed = new Set(ids.filter((id) => Number.isSafeInteger(id) && id > 0));
  const events = state.events.filter((event) => !dismissed.has(event.id));
  return events.length === state.events.length ? state : { ...state, events };
}

export function jumpCommand(
  event: Pick<AttentionEvent, "address"> | null,
  terminals: readonly unknown[],
): JumpCommand | null {
  if (!event || !isAddress(event.address)) return null;
  const isLive = terminals.some(
    (terminal) => isRecord(terminal) && terminal.address === event.address && terminal.state === "live",
  );
  return isLive ? ["agent.focus", { terminal: event.address }] : null;
}

function parsePersisted(raw: unknown): unknown {
  if (typeof raw !== "string") return raw;
  if (raw.length > MAX_PERSISTED_CHARS) return null;
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    return null;
  }
}

function restoreEvents(raw: unknown[]): AttentionEvent[] {
  const events = new Map<number, AttentionEvent>();
  for (const value of raw.slice(0, MAX_UNREAD_EVENTS * 4)) {
    if (
      !isRecord(value) ||
      !Number.isSafeInteger(value.id) ||
      (value.id as number) <= 0 ||
      !isAddress(value.address) ||
      !isAttention(value.status)
    )
      continue;
    const id = value.id as number;
    if (events.has(id)) continue;
    events.set(id, {
      id,
      address: value.address,
      status: value.status,
      title: cleanLabel(value.title),
      space: cleanLabel(value.space),
      tab: cleanLabel(value.tab),
    });
  }
  return [...events.values()].sort((left, right) => right.id - left.id).slice(0, MAX_UNREAD_EVENTS);
}

function restoreSeen(raw: unknown[]): RememberedAgent[] {
  const seen = new Map<string, RememberedAgent>();
  for (const value of raw.slice(-MAX_REMEMBERED_AGENTS * 2)) {
    if (!isRecord(value) || !isAddress(value.address) || !isAgentStatus(value.status)) continue;
    const agent = {
      address: value.address,
      status: value.status,
      title: cleanLabel(value.title),
      space: cleanLabel(value.space),
      tab: cleanLabel(value.tab),
    };
    seen.delete(agent.address);
    seen.set(agent.address, agent);
  }
  return [...seen.values()].slice(-MAX_REMEMBERED_AGENTS);
}

function isAgentSnapshot(value: unknown): value is AgentSnapshot {
  if (!isRecord(value)) return false;
  return (
    isAddress(value.address) &&
    isAgentStatus(value.status) &&
    Number.isSafeInteger(value.seq) &&
    (value.seq as number) >= 0
  );
}

function normalizeAgent(agent: AgentSnapshot): AgentSnapshot {
  return {
    address: agent.address,
    status: agent.status,
    seq: agent.seq,
    title: cleanLabel(agent.title),
    space_name: cleanLabel(agent.space_name),
    tab_name: cleanLabel(agent.tab_name),
  };
}

function remember(agent: AgentSnapshot): RememberedAgent {
  return {
    address: agent.address,
    status: agent.status,
    title: cleanLabel(agent.title),
    space: cleanLabel(agent.space_name),
    tab: cleanLabel(agent.tab_name),
  };
}

function compareReports(left: AgentSnapshot, right: AgentSnapshot): number {
  if (left.seq !== right.seq) return right.seq - left.seq;
  if (left.address !== right.address) return compareText(left.address, right.address);
  if (left.status !== right.status) return STATUS_PRIORITY[left.status] - STATUS_PRIORITY[right.status];
  for (const key of ["title", "space_name", "tab_name"] as const) {
    const result = compareText(cleanLabel(left[key]), cleanLabel(right[key]));
    if (result !== 0) return result;
  }
  return 0;
}

function sameRememberedAgent(left: RememberedAgent | undefined, right: RememberedAgent): boolean {
  return (
    left?.address === right.address &&
    left.status === right.status &&
    left.title === right.title &&
    left.space === right.space &&
    left.tab === right.tab
  );
}

function cleanLabel(value: unknown): string {
  return typeof value === "string" ? value.replace(/[\u0000-\u001f\u007f]/g, " ").slice(0, MAX_LABEL_LENGTH) : "";
}

function isAddress(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.length > 0 &&
    value.length <= MAX_ADDRESS_LENGTH &&
    !/[\u0000-\u001f\u007f]/.test(value)
  );
}

function isAgentStatus(value: unknown): value is AgentStatus {
  return typeof value === "string" && STATUSES.has(value as AgentStatus);
}

function isAttention(value: unknown): value is AttentionStatus {
  return value === "done" || value === "blocked";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}
