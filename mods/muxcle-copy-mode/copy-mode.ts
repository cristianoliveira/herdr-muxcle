export const COPY_MODE_LABEL = "muxcle.copy-mode.owner.v1";
export const COPY_MODE_ACTIVE_KEY = "muxcle-copy-mode.active.v1";

export function copyModeKeyAction(keystroke: string): "capture" | "close" | null {
  if (keystroke === "enter") return "capture";
  if (keystroke === "escape") return "close";
  return null;
}

const ACTIVE_SCHEMA = 1;
const MAX_LAYOUT_NODES = 5000;
const MAX_LAYOUT_DEPTH = 48;
const TERMINAL_ADDRESS = /^(?:[A-Za-z0-9_.-]+\/)?t[a-z0-9]+$/u;
const LOCAL_ADDRESS = /^t[a-z0-9]+$/u;
const OWNER_TOKEN = /^[a-z0-9-]{8,64}$/u;

export interface CopyModeTarget {
  terminal: string;
  machine: string | null;
  focus: {
    space: string;
    tab: string;
    pane: string | null;
    terminal: string | null;
    shown: string | null;
    agent: string | null;
  };
}

export interface CopyModePlan extends CopyModeTarget {
  coreId: string;
  machineId: string | null;
  cwd: string;
  script: string;
  command: string[];
  dependencies: string[];
}

export interface CopyModeSession {
  address: string;
  token: string;
  coreId: string;
  machine: string | null;
  machineId: string | null;
  terminal: string;
  cwd: string;
  command: string[];
  script: string;
}

export interface CopyModeReceipt extends CopyModeSession {
  state: "live" | "finished";
}

export interface CopyModeActiveRecord {
  schema: 1;
  token: string;
  phase: "starting" | "opening" | "active" | "uncertain";
  coreId?: string;
  machine?: string | null;
  machineId?: string | null;
  terminal?: string;
  cwd?: string;
  command?: string[];
  session?: CopyModeSession;
  evidence?: string;
}

export interface CopyModeResult {
  kind: "opened" | "opened-existing" | "left-running";
  session: CopyModeSession;
  overlay?: string;
  evidence?: string;
}

export interface CommandResult {
  code: number;
  stdout: string;
  stderr: string;
}

export type CopyModeCore = (args: string[]) => Promise<CommandResult>;

export type CopyModeInspection =
  | "live-owned"
  | "gone"
  | "finished"
  | "kept"
  | "foreign-core"
  | "foreign-machine"
  | "unowned";

export interface CopyModeIO {
  active(): unknown;
  claimActive(record: CopyModeActiveRecord): boolean;
  setActive(record: CopyModeActiveRecord): boolean;
  clearActive(token: string): void;
  core: CopyModeCore;
  open(spec: Record<string, unknown>): string | null;
  cancelled(): boolean;
}

export function copyModeTarget(focus: unknown, layout: unknown, agents: unknown, spaces: unknown): CopyModeTarget {
  if (!isRecord(focus) || !Array.isArray(agents) || !Array.isArray(spaces)) throw focusError();
  if (
    typeof focus.space !== "string" ||
    typeof focus.tab !== "string" ||
    !isPaneReference(focus.pane) ||
    !isReference(focus.terminal) ||
    !isReference(focus.shown) ||
    !isReference(focus.agent)
  ) {
    throw focusError();
  }
  if (focus.pane === null && focus.shown !== null) throw focusError();
  const context: CopyModeTarget["focus"] = {
    space: focus.space,
    tab: focus.tab,
    pane: focus.pane,
    terminal: focus.terminal,
    shown: focus.shown,
    agent: null,
  };

  // Native sets pane to null and terminal to the exact address for a focused literal terminal block.
  // That precise target wins over other visible layout surfaces and unrelated space context.
  if (focus.pane === null && focus.terminal !== null) {
    return targetFor(context, focus.terminal, null);
  }

  const surfaces = visibleSurfacesIn(layout);
  let agentTarget: string | null = null;
  if (surfaces.agents.length > 0) {
    if (surfaces.agents.some((value) => value !== "focused")) {
      throw new Error("A visible agent block has an unsupported target; copy mode refuses ambiguous focus.");
    }
    if (!isDisplayedAddress(focus.agent)) {
      throw new Error("A visible agent body has no verified focused agent; copy mode refuses ambiguous focus.");
    }
    const agent = agents.find((item) => isRecord(item) && item.address === focus.agent);
    if (
      !isRecord(agent) ||
      !isDisplayedAddress(agent.address) ||
      typeof agent.space !== "string" ||
      typeof agent.tab !== "string"
    ) {
      throw new Error(
        "The visible focused agent is not in Native's live agent list; copy mode refuses ambiguous focus.",
      );
    }
    const agentSpace = spaces.find((item) => isRecord(item) && item.id === agent.space);
    if (!isRecord(agentSpace) || agentSpace.machine !== machineFromAddress(agent.address)) {
      throw new Error("The visible agent address does not match its own Native space; copy mode refuses ambiguity.");
    }
    agentTarget = agent.address;
  }

  const focusedPane = focus.pane !== null ? (focus.shown ?? focus.terminal) : null;
  const visibleTargets: string[] = [];
  if (surfaces.activeTab) {
    if (!isDisplayedAddress(focusedPane)) {
      throw new Error("The visible active tab has no focused terminal address; copy mode refuses ambiguity.");
    }
    visibleTargets.push(focusedPane);
  }
  if (agentTarget !== null) visibleTargets.push(agentTarget);
  for (const terminal of surfaces.terminals) {
    if (!isDisplayedAddress(terminal)) throw focusError();
    visibleTargets.push(terminal);
  }

  if (surfaces.terminals.length > 0 && !surfaces.activeTab && !surfaces.agents.length) {
    if (!isDisplayedAddress(focusedPane) || !surfaces.terminals.includes(focusedPane)) {
      throw new Error("No Native-visible terminal body matches focused pane; copy mode refuses ambiguous focus.");
    }
  }
  if (visibleTargets.length === 0) {
    throw new Error(
      "No visible terminal body can be proven from Native layout and focus; copy mode refuses ambiguity.",
    );
  }
  if (visibleTargets.some((terminal) => terminal !== visibleTargets[0])) {
    throw new Error("Visible terminal surfaces have different targets; copy mode refuses ambiguous surface focus.");
  }

  const selectedAgent = agentTarget === visibleTargets[0] ? focus.agent : null;
  return targetFor(context, visibleTargets[0], selectedAgent);
}

function targetFor(focus: CopyModeTarget["focus"], terminal: unknown, agent: string | null): CopyModeTarget {
  if (!isDisplayedAddress(terminal)) throw focusError();
  return {
    terminal,
    machine: machineFromAddress(terminal),
    focus: { ...focus, agent },
  };
}

export function copyModePlan(
  target: CopyModeTarget,
  appHome: string,
  home: string,
  coreId: string,
  machineId: string | null,
): CopyModePlan {
  if (!isDisplayedAddress(target.terminal) || !isCoreId(coreId)) throw focusError();
  if ((target.machine === null) !== (machineId === null)) {
    throw new Error("Copy mode requires a verified remote machine identity before capture.");
  }

  const safeAppHome = trustedDirectory(appHome, "Herdr app home");
  const cwd = trustedDirectory(home, "local home");
  const script = `${safeAppHome}/mods/muxcle-copy-mode/copy_mode.py`;
  const command = ["python3", script, "--terminal", target.terminal, "--core-id", coreId];
  if (target.machine !== null && machineId !== null) {
    command.push("--machine", target.machine, "--machine-id", machineId);
  }

  return {
    ...target,
    coreId,
    machineId,
    cwd,
    script,
    command,
    dependencies: ["python3", "hc", "nvim"],
  };
}

export function copyRunArgs(plan: CopyModePlan, token: string): string[] {
  if (!OWNER_TOKEN.test(token)) throw new Error("Copy mode ownership token is invalid.");
  return [
    "run",
    "--bg",
    "--json",
    "--no-parent",
    "--no-notify",
    "--rm",
    "--label",
    `${COPY_MODE_LABEL}=${token}`,
    "--cwd",
    plan.cwd,
    "--",
    ...plan.command,
  ];
}

export function parseCopyModeReceipt(result: CommandResult, plan: CopyModePlan, token: string): CopyModeReceipt {
  const value = readData(result, "launch");
  const address = value.address;
  const state = value.state;
  if (typeof address !== "string" || !LOCAL_ADDRESS.test(address)) {
    throw new Error("Core returned an invalid local copy mode terminal address.");
  }
  if (state !== "live" && state !== "finished") throw new Error("Core returned a malformed copy mode state.");
  if (!matchesViewer(value, address, plan, token)) {
    throw new Error(`Core returned an unverified copy mode receipt for ${address}.`);
  }
  return sessionFrom(address, plan, token, state);
}

export function copyOverlay(address: string): Record<string, unknown> {
  if (!LOCAL_ADDRESS.test(address)) throw new Error("Copy mode viewer address is invalid.");
  return {
    kind: "dialog",
    width: 0.8,
    height: 0.8,
    layout: {
      type: "column",
      children: [
        {
          id: "copy-mode-peek",
          type: "block",
          size: { px: 36 },
          content: { mod: "peek", props: { terminal: address } },
        },
        { id: "copy-mode-terminal", type: "block", content: { terminal: address } },
      ],
    },
  };
}

export async function launchCopyMode(
  requested: boolean,
  resolvePlan: () => Promise<CopyModePlan | null>,
  io: CopyModeIO,
  token: string,
): Promise<CopyModeResult | null> {
  if (!requested || io.cancelled()) return null;
  if (!OWNER_TOKEN.test(token)) throw new Error("Copy mode ownership token is invalid.");

  const previous = io.active();
  if (previous !== null && previous !== undefined) {
    const record = parseActive(previous);
    if (!record || !record.session) {
      throw new Error("Copy mode launch outcome is unresolved. Do not retry; inspect with: hc ls --all");
    }
    return reconcileExisting(io, resolvePlan, record);
  }

  const plan = await resolvePlan();
  if (!plan) throw focusError();
  const initial: CopyModeActiveRecord = {
    schema: ACTIVE_SCHEMA,
    token,
    phase: "starting",
    coreId: plan.coreId,
    machine: plan.machine,
    machineId: plan.machineId,
    terminal: plan.terminal,
    cwd: plan.cwd,
    command: plan.command,
  };
  if (!io.claimActive(initial)) {
    throw new Error("A copy mode launch is already active. Inspect it before retrying: hc ls --all");
  }

  let launched = false;
  let session: CopyModeSession | null = null;
  try {
    if (io.cancelled()) {
      io.clearActive(token);
      return null;
    }
    if (!samePlan(plan, await resolvePlan())) {
      io.clearActive(token);
      throw new Error("Focus or Core changed before capture. Refocus the displayed terminal and retry.");
    }
    if (io.cancelled()) {
      io.clearActive(token);
      return null;
    }

    launched = true;
    const receipt = parseCopyModeReceipt(await io.core(copyRunArgs(plan, token)), plan, token);
    session = receipt;
    if (receipt.state === "finished") {
      io.clearActive(token);
      return null;
    }

    if (!io.setActive({ ...initial, phase: "opening", session })) {
      return leaveViewerRunning(io, token, session, "The copy mode ownership record changed after launch.");
    }

    const currentPlan = await resolvePlan();
    if (!samePlan(plan, currentPlan)) {
      return leaveViewerRunning(io, token, session, "Focus, Core, or machine identity changed after capture.");
    }
    const inspection = await inspectCopyMode(session, io.core);
    if (inspection === "gone" || inspection === "finished") {
      io.clearActive(token);
      return null;
    }
    if (inspection !== "live-owned") {
      return leaveViewerRunning(io, token, session, `The viewer could not be re-verified (${inspection}).`);
    }
    if (io.cancelled()) {
      return leaveViewerRunning(io, token, session, "The launcher closed after capture; the viewer was left running.");
    }

    const overlay = io.open(copyOverlay(session.address));
    if (!overlay) return leaveViewerRunning(io, token, session, "Herdr did not return an overlay ID.");
    if (!io.setActive({ ...initial, phase: "active", session })) {
      return leaveViewerRunning(io, token, session, "The ownership record changed after the overlay opened.");
    }
    return { kind: "opened", session, overlay };
  } catch (error) {
    if (!launched) {
      io.clearActive(token);
      throw error;
    }
    if (session) return leaveViewerRunning(io, token, session, errorMessage(error));
    const evidence = errorMessage(error);
    io.setActive({ ...initial, phase: "uncertain", evidence });
    throw new Error(
      `Copy mode launch outcome is uncertain; no automatic retry or cleanup was attempted. ${evidence} Inspect with: hc ls --all`,
    );
  }
}

export async function inspectCopyMode(session: CopyModeSession, core: CopyModeCore): Promise<CopyModeInspection> {
  const coreId = await readCoreId(core);
  if (coreId !== session.coreId) return "foreign-core";
  if (session.machine !== null) {
    const machineId = await readMachineId(core, session.machine);
    if (machineId !== session.machineId) return "foreign-machine";
  }

  const result = await core(["get", "--json", session.address]);
  const value = optionalData(result);
  if (result.code !== 0) {
    if (isNotFound(value)) return "gone";
    throw coreError(result, "inspect the copy mode viewer");
  }
  if (!isRecord(value) || value.address !== session.address) return "unowned";
  if (value.state === "finished") return "finished";
  if (value.state !== "live") return "unowned";
  if (value.keep === true) return "kept";
  if (!matchesViewer(value, session.address, session, session.token)) return "unowned";
  return "live-owned";
}

async function reconcileExisting(
  io: CopyModeIO,
  resolvePlan: () => Promise<CopyModePlan | null>,
  active: CopyModeActiveRecord,
): Promise<CopyModeResult | null> {
  const session = active.session;
  if (!session) throw new Error("Copy mode launch outcome is unresolved. Inspect with: hc ls --all");
  const current = await resolvePlan();
  if (io.cancelled()) return null;
  if (!current) throw new Error("Focus a displayed terminal before reopening copy mode.");
  if (session.coreId !== current.coreId) {
    throw new Error(
      `Copy mode viewer ${session.address} belongs to a different Herdr Core/session. Inspect with: hc get ${session.address}`,
    );
  }
  if (session.machine !== current.machine || session.machineId !== current.machineId) {
    throw new Error(
      `Copy mode viewer ${session.address} belongs to a different remote machine identity. Inspect with: hc get ${session.address}`,
    );
  }
  if (!samePlanFields(session, current)) {
    throw new Error(
      `Copy mode viewer ${session.address} belongs to another focus. Close it with q before capturing a different terminal; inspect with: hc get ${session.address}`,
    );
  }

  const inspection = await inspectCopyMode(session, io.core);
  if (inspection === "gone" || inspection === "finished") {
    io.clearActive(active.token);
    throw new Error("The previous copy mode viewer has exited. Retry the explicit capture action.");
  }
  if (inspection !== "live-owned") {
    throw new Error(
      `Copy mode viewer ${session.address} was left untouched (${inspection}). Inspect with: hc get ${session.address}`,
    );
  }
  if (io.cancelled()) return null;
  const latest = await resolvePlan();
  if (io.cancelled()) return null;
  if (!samePlan(current, latest)) {
    throw new Error("Focus, Core, or machine identity changed while reopening the existing viewer.");
  }
  const overlay = io.open(copyOverlay(session.address));
  if (!overlay) throw new Error(`Could not reopen viewer ${session.address}; inspect with: hc get ${session.address}`);
  return { kind: "opened-existing", session, overlay };
}

function leaveViewerRunning(io: CopyModeIO, token: string, session: CopyModeSession, evidence: string): CopyModeResult {
  io.setActive({
    schema: ACTIVE_SCHEMA,
    token,
    phase: "uncertain",
    coreId: session.coreId,
    machine: session.machine,
    machineId: session.machineId,
    terminal: session.terminal,
    cwd: session.cwd,
    command: session.command,
    session,
    evidence,
  });
  return { kind: "left-running", session, evidence };
}

function sessionFrom(address: string, plan: CopyModePlan, token: string, _state: "live" | "finished"): CopyModeReceipt {
  return {
    address,
    token,
    coreId: plan.coreId,
    machine: plan.machine,
    machineId: plan.machineId,
    terminal: plan.terminal,
    cwd: plan.cwd,
    command: plan.command,
    script: plan.script,
    state: _state,
  };
}

function matchesViewer(
  value: Record<string, unknown>,
  address: string,
  expected: Pick<CopyModePlan, "coreId" | "machine" | "machineId" | "terminal" | "cwd" | "command">,
  token: string,
): boolean {
  return (
    value.address === address &&
    isRecord(value.labels) &&
    value.labels[COPY_MODE_LABEL] === token &&
    value.cwd === expected.cwd &&
    sameStrings(value.argv, expected.command) &&
    value.keep === false &&
    (value.parent === null || value.parent === undefined)
  );
}

export async function readCoreId(core: CopyModeCore): Promise<string> {
  const value = readData(await core(["server", "status", "--json"]), "read Core identity");
  if (!isRecord(value.core) || !isCoreId(value.core.id)) throw new Error("Herdr returned no stable Core identity.");
  return value.core.id;
}

export async function readMachineId(core: CopyModeCore, machine: string): Promise<string> {
  const value = readData(await core(["machine", "ls", "--json"]), "read remote machine identity");
  if (!Array.isArray(value.machines)) throw new Error("Herdr returned invalid remote machine metadata.");
  const matches = value.machines.filter((entry) => isRecord(entry) && entry.name === machine);
  if (matches.length !== 1 || !isRecord(matches[0]) || !isCoreId(matches[0].id)) {
    throw new Error(`Remote machine ${machine} is missing or ambiguous.`);
  }
  return matches[0].id;
}

function parseActive(value: unknown): CopyModeActiveRecord | null {
  if (
    !isRecord(value) ||
    value.schema !== ACTIVE_SCHEMA ||
    typeof value.token !== "string" ||
    !OWNER_TOKEN.test(value.token)
  )
    return null;
  const phase = value.phase;
  if (phase !== "starting" && phase !== "opening" && phase !== "active" && phase !== "uncertain") return null;
  const record: CopyModeActiveRecord = { schema: ACTIVE_SCHEMA, token: value.token, phase };
  if (typeof value.coreId === "string") record.coreId = value.coreId;
  if (value.machine === null || typeof value.machine === "string") record.machine = value.machine;
  if (value.machineId === null || typeof value.machineId === "string") record.machineId = value.machineId;
  if (typeof value.terminal === "string") record.terminal = value.terminal;
  if (typeof value.cwd === "string") record.cwd = value.cwd;
  if (Array.isArray(value.command) && value.command.every((part) => typeof part === "string"))
    record.command = value.command;
  if (typeof value.evidence === "string") record.evidence = value.evidence;
  const session = parseSession(value.session);
  if (session && session.token === record.token && (!record.coreId || session.coreId === record.coreId)) {
    record.session = session;
  }
  return record;
}

function parseSession(value: unknown): CopyModeSession | null {
  if (
    !isRecord(value) ||
    typeof value.address !== "string" ||
    !LOCAL_ADDRESS.test(value.address) ||
    typeof value.token !== "string" ||
    !OWNER_TOKEN.test(value.token) ||
    !isCoreId(value.coreId) ||
    !(value.machine === null || typeof value.machine === "string") ||
    !(value.machineId === null || typeof value.machineId === "string") ||
    !isDisplayedAddress(value.terminal) ||
    typeof value.cwd !== "string" ||
    typeof value.script !== "string" ||
    !Array.isArray(value.command) ||
    !value.command.every((part) => typeof part === "string")
  )
    return null;
  if ((value.machine === null) !== (value.machineId === null) || machineFromAddress(value.terminal) !== value.machine)
    return null;
  return {
    address: value.address,
    token: value.token,
    coreId: value.coreId,
    machine: value.machine,
    machineId: value.machineId,
    terminal: value.terminal,
    cwd: value.cwd,
    command: value.command,
    script: value.script,
  };
}

function visibleSurfacesIn(layout: unknown): { activeTab: boolean; agents: unknown[]; terminals: unknown[] } {
  if (!isRecord(layout)) throw new Error("Native layout is unavailable; copy mode refuses ambiguous focus.");
  const surfaces = { activeTab: false, agents: [] as unknown[], terminals: [] as unknown[] };
  let nodeCount = 0;

  const visitBlock = (block: Record<string, unknown>): void => {
    if (!isRecord(block.content)) return;
    const content = block.content;
    if (Object.hasOwn(content, "agent")) surfaces.agents.push(content.agent);
    if (content.tab === "active") surfaces.activeTab = true;
    if (Object.hasOwn(content, "terminal")) surfaces.terminals.push(content.terminal);
  };

  const visit = (node: unknown, depth: number): void => {
    if (!isRecord(node)) throw new Error("Native layout is malformed; copy mode refuses ambiguous focus.");
    nodeCount += 1;
    if (nodeCount > MAX_LAYOUT_NODES || depth > MAX_LAYOUT_DEPTH) {
      throw new Error("Native layout is too deep or large to inspect safely.");
    }
    if (node.hidden !== undefined && typeof node.hidden !== "boolean") {
      throw new Error("Native layout visibility is malformed; copy mode refuses ambiguous focus.");
    }
    if (node.hidden === true) return;

    if (node.type === "block") {
      visitBlock(node);
    } else if (node.type === "row" || node.type === "column") {
      if (!Array.isArray(node.children))
        throw new Error("Native layout children are malformed; copy mode refuses ambiguous focus.");
      for (const child of node.children) visit(child, depth + 1);
    } else if (node.type === "stack") {
      if (!Array.isArray(node.children)) {
        throw new Error("Native stack children are malformed; copy mode refuses ambiguous focus.");
      }
      const visibleChildren = node.children.filter((child) => isRecord(child) && child.hidden !== true);
      const active =
        typeof node.active === "string" ? visibleChildren.find((child) => child.id === node.active) : undefined;
      const selected = active ?? visibleChildren[0];
      if (selected) visit(selected, depth + 1);
    } else {
      throw new Error("Native layout node type is unsupported; copy mode refuses ambiguous focus.");
    }

    if (node.floating !== undefined) {
      if (!Array.isArray(node.floating))
        throw new Error("Native floating layout is malformed; copy mode refuses ambiguous focus.");
      for (const floating of node.floating) {
        if (!isRecord(floating))
          throw new Error("Native floating block is malformed; copy mode refuses ambiguous focus.");
        nodeCount += 1;
        if (nodeCount > MAX_LAYOUT_NODES || depth + 1 > MAX_LAYOUT_DEPTH) {
          throw new Error("Native layout is too deep or large to inspect safely.");
        }
        if (floating.hidden !== undefined && typeof floating.hidden !== "boolean") {
          throw new Error("Native floating visibility is malformed; copy mode refuses ambiguity.");
        }
        if (floating.hidden !== true) visitBlock(floating);
      }
    }
  };

  visit(layout, 0);
  return surfaces;
}

export function sameCopyModeTarget(left: CopyModeTarget, right: CopyModeTarget): boolean {
  return left.terminal === right.terminal && left.machine === right.machine && sameFocus(left.focus, right.focus);
}

function samePlan(left: CopyModePlan, right: CopyModePlan | null): boolean {
  return right !== null && samePlanFields(left, right) && sameFocus(left.focus, right.focus);
}

function samePlanFields(
  left: Pick<CopyModePlan, "terminal" | "machine" | "machineId" | "coreId" | "cwd" | "script" | "command">,
  right: Pick<CopyModePlan, "terminal" | "machine" | "machineId" | "coreId" | "cwd" | "script" | "command">,
): boolean {
  return (
    left.terminal === right.terminal &&
    left.machine === right.machine &&
    left.machineId === right.machineId &&
    left.coreId === right.coreId &&
    left.cwd === right.cwd &&
    left.script === right.script &&
    sameStrings(left.command, right.command)
  );
}

function sameFocus(left: CopyModeTarget["focus"], right: CopyModeTarget["focus"]): boolean {
  return (
    left.space === right.space &&
    left.tab === right.tab &&
    left.pane === right.pane &&
    left.terminal === right.terminal &&
    left.shown === right.shown &&
    left.agent === right.agent
  );
}

function readData(result: CommandResult, operation: string): Record<string, unknown> {
  const value = optionalData(result);
  if (result.code !== 0 || !isRecord(value) || value.error) throw coreError(result, operation);
  return value;
}

function optionalData(result: CommandResult): unknown {
  for (const output of [result.stdout, result.stderr]) {
    if (!output.trim()) continue;
    try {
      return JSON.parse(output);
    } catch {
      // Try the other stream before reporting malformed output.
    }
  }
  return null;
}

function coreError(result: CommandResult, operation: string): Error {
  const value = optionalData(result);
  const message =
    isRecord(value) && isRecord(value.error) && typeof value.error.message === "string"
      ? value.error.message
      : result.stderr.trim() || `Herdr could not ${operation}.`;
  return new Error(message);
}

function isNotFound(value: unknown): boolean {
  return isRecord(value) && isRecord(value.error) && value.error.kind === "not_found";
}

function trustedDirectory(path: string, label: string): string {
  if (
    typeof path !== "string" ||
    !path.startsWith("/") ||
    path.startsWith("//") ||
    path.includes("\0") ||
    path.split("/").includes("..")
  )
    throw new Error(`Copy mode requires a trusted absolute ${label}.`);
  return path.replace(/\/+$/u, "") || "/";
}

function machineFromAddress(address: string): string | null {
  return address.includes("/") ? address.split("/", 1)[0] : null;
}

function isCoreId(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}

function isDisplayedAddress(value: unknown): value is string {
  return typeof value === "string" && TERMINAL_ADDRESS.test(value);
}

function isPaneReference(value: unknown): value is string | null {
  return value === null || (typeof value === "string" && value.length > 0);
}

function isReference(value: unknown): value is string | null {
  return value === null || (typeof value === "string" && value.length > 0);
}

function focusError(): Error {
  return new Error("Focus a terminal before opening copy mode.");
}

function sameStrings(value: unknown, expected: string[]): boolean {
  return (
    Array.isArray(value) && value.length === expected.length && value.every((part, index) => part === expected[index])
  );
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
