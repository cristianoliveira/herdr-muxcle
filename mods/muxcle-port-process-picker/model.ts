export interface ProcessEvidence {
  pid: number;
  uid: number;
  command: string;
  startedAt: string;
  ports: readonly number[];
}

export interface ProcessInventory {
  processes: readonly ProcessEvidence[];
  warnings: readonly string[];
}

export interface LocalContext {
  space: string;
  tab: string;
  pane: string;
  terminal: string;
}

export type LocalContextResult = { kind: "local"; context: LocalContext } | { kind: "unavailable"; message: string };

export type PickerPhase = "selecting" | "reviewing" | "force-reviewing" | "signaling" | "complete" | "cancelled";

export type SignalKind = "TERM" | "KILL";
export type ProcessSignalStatus = "sent" | "stale" | "gone" | "denied" | "failed";

export interface ProcessSignalResult {
  pid: number;
  status: ProcessSignalStatus;
  message?: string;
}

export type SignalOutcome =
  | { kind: "completed"; signal: SignalKind; results: readonly ProcessSignalResult[] }
  | { kind: "unknown"; message: string };

export const MAX_PROCESS_COUNT = 500;
export const MAX_SELECTED_PROCESS_COUNT = 32;
const MAX_INVENTORY_CHARS = 512 * 1024;
const MAX_WARNING_COUNT = 20;
const MAX_LAYOUT_NODES = 5_000;
const MAX_LAYOUT_DEPTH = 48;

export function localContext(focus: unknown, spaces: unknown, panes: unknown, layout: unknown): LocalContextResult {
  if (!isRecord(focus) || !Array.isArray(spaces) || !Array.isArray(panes)) return localUnavailable();

  const { space, tab, pane, terminal, shown, agent } = focus;
  if (
    (agent !== null && !validText(agent, 512)) ||
    !validText(space, 512) ||
    !validText(tab, 512) ||
    !validText(pane, 512) ||
    !isLocalTerminal(terminal) ||
    shown !== null
  ) {
    return localUnavailable();
  }

  const owners = spaces.filter((candidate) => isRecord(candidate) && candidate.id === space);
  if (owners.length !== 1 || !isRecord(owners[0]) || owners[0].machine !== null || owners[0].active !== true) {
    return localUnavailable();
  }
  const activeTabs = Array.isArray(owners[0].tabs)
    ? owners[0].tabs.filter((candidate) => isRecord(candidate) && candidate.id === tab && candidate.active === true)
    : [];
  if (activeTabs.length !== 1) return localUnavailable();

  const matchingPanes = panes.filter(
    (candidate) =>
      isRecord(candidate) &&
      candidate.pane === pane &&
      candidate.tab === tab &&
      candidate.terminal === terminal &&
      (candidate.mod === undefined || candidate.mod === null),
  );
  if (matchingPanes.length !== 1 || !hasVisibleOrdinaryTerminal(layout, terminal)) return localUnavailable();

  return {
    kind: "local",
    context: Object.freeze({ space, tab, pane, terminal }),
  };
}

export function sameLocalContext(left: LocalContext, right: LocalContext): boolean {
  return (
    left.space === right.space && left.tab === right.tab && left.pane === right.pane && left.terminal === right.terminal
  );
}

export function parseInventory(text: string): ProcessInventory {
  if (typeof text !== "string" || text.length > MAX_INVENTORY_CHARS) {
    throw new Error("Process inventory exceeded its size limit.");
  }

  let payload: unknown;
  try {
    payload = JSON.parse(text);
  } catch {
    throw new Error("Process inventory returned invalid JSON.");
  }

  if (
    !isRecord(payload) ||
    payload.schema !== 1 ||
    !Array.isArray(payload.processes) ||
    !Array.isArray(payload.warnings)
  ) {
    throw new Error("Process inventory has an unsupported shape.");
  }
  if (payload.processes.length > MAX_PROCESS_COUNT) throw new Error("Process inventory exceeded its process limit.");
  if (payload.warnings.length > MAX_WARNING_COUNT) throw new Error("Process inventory exceeded its warning limit.");

  const seen = new Set<number>();
  const processes = payload.processes.map((value) => {
    const process = validateProcess(value);
    if (seen.has(process.pid)) throw new Error("Process inventory contains a duplicate PID.");
    seen.add(process.pid);
    return process;
  });
  const warnings = payload.warnings.map((warning) => {
    if (!validDisplayText(warning, 512)) throw new Error("Process inventory contains an invalid warning.");
    return warning;
  });

  processes.sort((left, right) => left.pid - right.pid);
  return Object.freeze({ processes: Object.freeze(processes), warnings: Object.freeze(warnings) });
}

export function filterProcesses(processes: readonly ProcessEvidence[], query: string): ProcessEvidence[] {
  const words = query.toLowerCase().trim().split(/\s+/u).filter(Boolean);
  if (words.length === 0) return [...processes];
  return processes.filter((process) => {
    const label =
      `${process.pid} ${process.uid} ${process.command} ${process.startedAt} ${process.ports.join(" ")}`.toLowerCase();
    return words.every((word) => label.includes(word));
  });
}

export class PortProcessPickerModel {
  private currentPhase: PickerPhase = "selecting";
  private snapshot: ProcessInventory = Object.freeze({ processes: Object.freeze([]), warnings: Object.freeze([]) });
  private selected = new Set<number>();
  private reviewed: readonly ProcessEvidence[] | null = null;
  private signalResult: SignalOutcome | null = null;

  get phase(): PickerPhase {
    return this.currentPhase;
  }

  get processes(): readonly ProcessEvidence[] {
    return this.snapshot.processes;
  }

  get warnings(): readonly string[] {
    return this.snapshot.warnings;
  }

  get selectedPids(): ReadonlySet<number> {
    return new Set(this.selected);
  }

  get reviewSnapshot(): readonly ProcessEvidence[] | null {
    return this.reviewed;
  }

  get outcome(): SignalOutcome | null {
    return this.signalResult;
  }

  clearInventory(): boolean {
    if (this.currentPhase !== "selecting") return false;
    this.snapshot = Object.freeze({ processes: Object.freeze([]), warnings: Object.freeze([]) });
    this.selected.clear();
    this.reviewed = null;
    return true;
  }

  setInventory(inventory: ProcessInventory): boolean {
    if (this.currentPhase !== "selecting") return false;
    this.snapshot = inventory;
    this.selected.clear();
    this.reviewed = null;
    return true;
  }

  toggle(pid: number): boolean {
    if (this.currentPhase !== "selecting" || !Number.isSafeInteger(pid) || pid <= 0) return false;
    if (!this.snapshot.processes.some((process) => process.pid === pid)) return false;
    if (this.selected.has(pid)) {
      this.selected.delete(pid);
      return true;
    }
    if (this.selected.size >= MAX_SELECTED_PROCESS_COUNT) return false;
    this.selected.add(pid);
    return true;
  }

  startReview(): readonly ProcessEvidence[] | null {
    if (this.currentPhase !== "selecting" || this.selected.size === 0) return null;
    this.reviewed = Object.freeze(
      this.snapshot.processes
        .filter((process) => this.selected.has(process.pid))
        .map((process) => Object.freeze({ ...process, ports: Object.freeze([...process.ports]) })),
    );
    if (this.reviewed.length !== this.selected.size) {
      this.reviewed = null;
      return null;
    }
    this.currentPhase = "reviewing";
    return this.reviewed;
  }

  startForceReview(): boolean {
    if (this.currentPhase !== "reviewing" || this.reviewed === null) return false;
    this.currentPhase = "force-reviewing";
    return true;
  }

  back(): boolean {
    if (this.currentPhase !== "reviewing" && this.currentPhase !== "force-reviewing") return false;
    this.reviewed = null;
    this.currentPhase = "selecting";
    return true;
  }

  startSignal(signal: SignalKind): readonly ProcessEvidence[] | null {
    if (signal === "TERM" && this.currentPhase === "reviewing" && this.reviewed?.length) {
      this.currentPhase = "signaling";
      return this.reviewed;
    }
    if (signal === "KILL" && this.currentPhase === "force-reviewing" && this.reviewed?.length) {
      this.currentPhase = "signaling";
      return this.reviewed;
    }
    return null;
  }

  finishSignal(outcome: SignalOutcome): void {
    if (this.currentPhase !== "signaling") return;
    this.signalResult = outcome;
    this.currentPhase = "complete";
  }

  keyAction(key: string): "cancel" | "ignore" {
    const normalized = key.toLowerCase();
    if (normalized === "escape" || normalized === "esc") {
      return this.cancel() ? "cancel" : "ignore";
    }
    return "ignore";
  }

  cancel(): boolean {
    if (this.currentPhase === "signaling" || this.currentPhase === "complete" || this.currentPhase === "cancelled") {
      return false;
    }
    this.currentPhase = "cancelled";
    this.selected.clear();
    this.reviewed = null;
    return true;
  }
}

function validateProcess(value: unknown): ProcessEvidence {
  if (
    !isRecord(value) ||
    !Number.isSafeInteger(value.pid) ||
    (value.pid as number) <= 0 ||
    !Number.isSafeInteger(value.uid) ||
    (value.uid as number) < 0 ||
    !validDisplayText(value.command, 512) ||
    !validDisplayText(value.startedAt, 128) ||
    !Array.isArray(value.ports) ||
    value.ports.length === 0 ||
    value.ports.length > 256
  ) {
    throw new Error("Process inventory contains an invalid process record.");
  }

  const ports = new Set<number>();
  for (const port of value.ports) {
    if (!Number.isSafeInteger(port) || port < 1 || port > 65_535 || ports.has(port)) {
      throw new Error("Process inventory contains an invalid process record.");
    }
    ports.add(port);
  }
  return Object.freeze({
    pid: value.pid as number,
    uid: value.uid as number,
    command: value.command,
    startedAt: value.startedAt,
    ports: Object.freeze([...ports].sort((left, right) => left - right)),
  });
}

function isLocalTerminal(value: unknown): value is string {
  return typeof value === "string" && /^t[a-z0-9]+$/u.test(value);
}

function validText(value: unknown, maximum: number): value is string {
  return (
    typeof value === "string" && value.length > 0 && value.length <= maximum && !/[\u0000-\u001f\u007f]/u.test(value)
  );
}

function validDisplayText(value: unknown, maximum: number): value is string {
  return (
    typeof value === "string" && value.length > 0 && value.length <= maximum && !/[\u0000-\u001f\u007f]/u.test(value)
  );
}

function hasVisibleOrdinaryTerminal(layout: unknown, terminal: string): boolean {
  const surfaces = visibleSurfacesIn(layout);
  if (surfaces === null || surfaces.agents.length > 0) return false;

  const targets: unknown[] = [];
  if (surfaces.activeTab) targets.push(terminal);
  if (surfaces.terminals.length > 0) {
    if (!surfaces.activeTab && !surfaces.terminals.includes(terminal)) return false;
    targets.push(...surfaces.terminals);
  }
  return targets.length > 0 && targets.every((target) => target === terminal);
}

function visibleSurfacesIn(layout: unknown): { activeTab: boolean; agents: unknown[]; terminals: unknown[] } | null {
  if (!isRecord(layout)) return null;
  const surfaces = { activeTab: false, agents: [] as unknown[], terminals: [] as unknown[] };
  let nodeCount = 0;

  const visitBlock = (block: Record<string, unknown>): boolean => {
    if (!isRecord(block.content)) return false;
    const content = block.content;
    if (Object.hasOwn(content, "agent")) surfaces.agents.push(content.agent);
    if (content.tab === "active") surfaces.activeTab = true;
    if (Object.hasOwn(content, "terminal")) surfaces.terminals.push(content.terminal);
    return true;
  };

  const visit = (node: unknown, depth: number): boolean => {
    if (!isRecord(node)) return false;
    nodeCount += 1;
    if (nodeCount > MAX_LAYOUT_NODES || depth > MAX_LAYOUT_DEPTH) return false;
    if (node.hidden !== undefined && typeof node.hidden !== "boolean") return false;
    if (node.hidden === true) return true;

    if (node.type === "block") {
      if (!visitBlock(node)) return false;
    } else if (node.type === "row" || node.type === "column") {
      if (!Array.isArray(node.children) || !node.children.every((child) => visit(child, depth + 1))) return false;
    } else if (node.type === "stack") {
      if (
        !Array.isArray(node.children) ||
        node.children.length > MAX_LAYOUT_NODES ||
        !node.children.every(isRecord) ||
        node.children.some((child) => child.hidden !== undefined && typeof child.hidden !== "boolean")
      ) {
        return false;
      }
      const visibleChildren = node.children.filter((child) => child.hidden !== true);
      const active =
        typeof node.active === "string" ? visibleChildren.find((child) => child.id === node.active) : undefined;
      const selected = active ?? visibleChildren[0];
      if (selected && !visit(selected, depth + 1)) return false;
    } else {
      return false;
    }

    if (node.floating !== undefined) {
      if (!Array.isArray(node.floating)) return false;
      for (const floating of node.floating) {
        if (!isRecord(floating)) return false;
        nodeCount += 1;
        if (nodeCount > MAX_LAYOUT_NODES || depth + 1 > MAX_LAYOUT_DEPTH) return false;
        if (floating.hidden !== undefined && typeof floating.hidden !== "boolean") return false;
        if (floating.hidden !== true && !visitBlock(floating)) return false;
      }
    }
    return true;
  };

  return visit(layout, 0) ? surfaces : null;
}

function localUnavailable(): LocalContextResult {
  return {
    kind: "unavailable",
    message:
      "Focus a visible ordinary terminal in the active local space. Remote, swapped, mod, visible-agent, and unknown contexts are refused; no local fallback is used.",
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
