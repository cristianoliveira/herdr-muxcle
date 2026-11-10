export const BROADCAST_LABEL = "muxcle.broadcast-prototype.owner.v1";
export const BROADCAST_ACTIVE_KEY = "muxcle.broadcast-prototype.active.v1";
export const MIN_TARGETS = 2;
export const MAX_TARGETS = 8;

export interface BroadcastTarget {
  pane: string;
  terminal: string;
}

export interface BroadcastPlan {
  coreId: string;
  space: string;
  tab: string;
  targets: BroadcastTarget[];
  cwd: string;
  script: string;
  command: string[];
  args: string[];
  dependencies: string[];
}

export interface BroadcastSession {
  address: string;
  token: string;
  pid?: number;
  createdMs?: number;
}

export interface BroadcastActiveRecord {
  schema: 1;
  token: string;
  phase: "starting" | "opening" | "active" | "uncertain";
  plan: BroadcastPlan;
  session?: BroadcastSession;
  evidence?: string;
}

export interface BroadcastCommandResult {
  code: number;
  stdout: string;
  stderr: string;
}

export interface BroadcastLifecycleIO {
  active(): unknown;
  claimActive(record: BroadcastActiveRecord): boolean;
  setActive(record: BroadcastActiveRecord): boolean;
  clearActive(token: string): void;
  launch(plan: BroadcastPlan, token: string): Promise<string>;
  inspect(
    session: BroadcastSession,
    plan: BroadcastPlan,
  ): Promise<{ kind: "live-owned" | "gone" | "finished" | "unowned"; pid?: number; createdMs?: number }>;
  waitReady(session: BroadcastSession, plan: BroadcastPlan): Promise<boolean>;
  open(address: string): string | null;
  cancelled(): boolean;
}

export type BroadcastLaunchResult =
  | { kind: "opened" | "opened-existing"; session: BroadcastSession; overlay: string }
  | { kind: "left-running"; session: BroadcastSession; evidence: string }
  | null;

export function captureBroadcastTargets(
  focus: unknown,
  spaces: unknown,
  panes: unknown,
  terminals: unknown,
): {
  space: string;
  tab: string;
  targets: BroadcastTarget[];
} {
  if (!isRecord(focus) || !Array.isArray(spaces) || !Array.isArray(panes) || !Array.isArray(terminals)) {
    throw new Error("Broadcast needs a verified focused local terminal tab.");
  }
  if (
    !isLocalId(focus.space) ||
    !isLocalId(focus.tab) ||
    !isLocalPane(focus.pane) ||
    !isLocalTerminal(focus.terminal) ||
    focus.shown !== null
  ) {
    throw new Error("Focus an ordinary local terminal pane; mod, popup and swapped targets are unsupported.");
  }

  const space = spaces.find((item) => isRecord(item) && item.id === focus.space);
  if (!isRecord(space) || space.machine !== null || space.active !== true || !Array.isArray(space.tabs)) {
    throw new Error("Broadcast is limited to the active local space.");
  }
  const tab = space.tabs.find((item) => isRecord(item) && item.id === focus.tab);
  if (!isRecord(tab) || tab.active !== true) throw new Error("Broadcast is limited to the active tab.");

  const members = panes.filter((pane) => isRecord(pane) && pane.tab === focus.tab && pane.terminal !== null);
  const targets: BroadcastTarget[] = [];
  for (const pane of members) {
    if (!isLocalPane(pane.pane) || !isLocalTerminal(pane.terminal) || pane.mod != null) {
      throw new Error("Tab contains an invalid or non-ordinary broadcast target.");
    }
    targets.push({ pane: pane.pane, terminal: pane.terminal });
  }

  const paneIds = targets.map(({ pane }) => pane);
  const addresses = targets.map(({ terminal }) => terminal);
  if (new Set(paneIds).size !== paneIds.length || new Set(addresses).size !== addresses.length) {
    throw new Error("Tab contains duplicate pane or terminal references; broadcast refused.");
  }
  if (!targets.some(({ pane, terminal }) => pane === focus.pane && terminal === focus.terminal)) {
    throw new Error("The focused terminal is not an ordinary pane in the active tab.");
  }
  if (targets.length < MIN_TARGETS || targets.length > MAX_TARGETS) {
    throw new Error("Broadcast needs 2–8 live local terminal panes in the active tab.");
  }

  for (const address of addresses) {
    const matches = terminals.filter((terminal) => isRecord(terminal) && terminal.address === address);
    if (matches.length !== 1 || !isRecord(matches[0]) || matches[0].state !== "live") {
      throw new Error(`Target ${address} is not exactly one live local terminal.`);
    }
  }

  return { space: focus.space, tab: focus.tab, targets };
}

export function broadcastPlan(
  capture: ReturnType<typeof captureBroadcastTargets>,
  appHome: string,
  home: string,
  coreId: string,
): BroadcastPlan {
  if (!isCoreId(coreId)) throw new Error("Could not verify the local Herdr Core identity.");
  const safeAppHome = absoluteDirectory(appHome, "Herdr app home");
  const cwd = absoluteDirectory(home, "local home");
  const script = `${safeAppHome}/mods/muxcle-broadcast-prototype/broadcast.py`;
  return {
    ...capture,
    coreId,
    cwd,
    script,
    command: ["python3", "-E", "-s", script],
    args: [
      "--targets",
      JSON.stringify(capture.targets),
      "--space",
      capture.space,
      "--tab",
      capture.tab,
      "--core-id",
      coreId,
      "--app-home",
      safeAppHome,
    ],
    dependencies: ["python3", "hc", "herdr-app"],
  };
}

export function broadcastReadyFile(plan: BroadcastPlan, token: string): string {
  if (!/^[a-z0-9-]{8,64}$/.test(token)) throw new Error("Broadcast ownership token is invalid.");
  return `${plan.cwd}/.muxcle-broadcast-${token}/ready`;
}

export function broadcastHelperArgs(plan: BroadcastPlan, token: string): string[] {
  return [...plan.args, "--ready-file", broadcastReadyFile(plan, token), "--ready-token", token];
}

export async function waitForBroadcastReady(
  session: BroadcastSession,
  plan: BroadcastPlan,
  execute: (
    command: string,
    args: string[],
    options: { cwd: string; timeout: number },
  ) => Promise<BroadcastCommandResult>,
  cancelled: () => boolean,
): Promise<boolean> {
  if (cancelled() || typeof session.pid !== "number" || session.pid <= 0) return false;
  const expected = `${session.token}:${session.pid}`;
  const result = await execute(
    "python3",
    ["-c", READY_MARKER_POLL, broadcastReadyFile(plan, session.token), expected],
    { cwd: plan.cwd, timeout: 12_000 },
  );
  return !cancelled() && result.code === 0 && result.stdout.trim() === "ready";
}

const READY_MARKER_POLL = [
  "import sys, time",
  "path, expected = sys.argv[1:3]",
  "deadline = time.monotonic() + 10",
  "while time.monotonic() < deadline:",
  "    try:",
  "        with open(path, encoding='utf-8') as marker:",
  "            if marker.read() == expected:",
  "                print('ready')",
  "                raise SystemExit(0)",
  "    except FileNotFoundError:",
  "        pass",
  "    time.sleep(0.05)",
  "raise SystemExit(1)",
].join("\n");

export function broadcastRunArgs(plan: BroadcastPlan, token: string): string[] {
  if (!/^[a-z0-9-]{8,64}$/.test(token)) throw new Error("Broadcast ownership token is invalid.");
  return [
    "run",
    "--bg",
    "--json",
    "--no-parent",
    "--no-notify",
    "--rm",
    "--label",
    `${BROADCAST_LABEL}=${token}`,
    "--cwd",
    plan.cwd,
    "--",
    ...plan.command,
    ...broadcastHelperArgs(plan, token),
  ];
}

export async function checkBroadcastDependencies(
  plan: BroadcastPlan,
  execute: (
    command: string,
    args: string[],
    options: { cwd: string; timeout: number },
  ) => Promise<BroadcastCommandResult>,
): Promise<void> {
  const script = await execute("test", ["-f", plan.script], { cwd: plan.cwd, timeout: 5000 });
  if (script.code !== 0) throw new Error(`Broadcast helper is missing. Restore: ${plan.script}`);
  const python = await execute("python3", ["-c", "import curses"], { cwd: plan.cwd, timeout: 5000 });
  if (python.code !== 0)
    throw new Error("Python 3 with the standard curses module is required; no helper was started.");
}

export async function launchBroadcast(
  requested: boolean,
  resolvePlan: () => Promise<BroadcastPlan | null>,
  io: BroadcastLifecycleIO,
  token: string,
): Promise<BroadcastLaunchResult> {
  if (!requested || io.cancelled()) return null;
  if (!/^[a-z0-9-]{8,64}$/.test(token)) throw new Error("Broadcast ownership token is invalid.");

  const plan = await resolvePlan();
  if (!plan || io.cancelled()) return null;
  const previous = parseActiveRecord(io.active());
  if (previous) return reconcileBroadcast(io, plan, previous);

  const initial: BroadcastActiveRecord = { schema: 1, token, phase: "starting", plan };
  if (!io.claimActive(initial)) {
    throw new Error("A broadcast helper is already starting or unresolved. Inspect it before retrying: hc ls --all");
  }

  let attempted = false;
  let confirmedEnded = false;
  let session: BroadcastSession | undefined;
  try {
    if (io.cancelled()) {
      io.clearActive(token);
      return null;
    }
    attempted = true;
    const address = await io.launch(plan, token);
    session = { address, token };
    const opening = { ...initial, phase: "opening" as const, session };
    if (!io.setActive(opening)) {
      return leaveBroadcastRunning(io, opening, "The ownership receipt changed after launch.");
    }
    if (io.cancelled()) return leaveBroadcastRunning(io, opening, "The launcher closed after launch.");

    const inspection = await io.inspect(session, plan);
    if (inspection.kind !== "live-owned") {
      if (inspection.kind === "gone" || inspection.kind === "finished") {
        io.clearActive(token);
        confirmedEnded = true;
        throw new Error("The broadcast helper exited before opening; retry only through an explicit new launch.");
      }
      return leaveBroadcastRunning(io, opening, `The helper could not be re-verified (${inspection.kind}).`);
    }
    session = { ...session, pid: inspection.pid, createdMs: inspection.createdMs };
    const verified = { ...opening, session };
    if (!io.setActive(verified))
      return leaveBroadcastRunning(io, opening, "The ownership receipt changed after verification.");
    if (io.cancelled()) return leaveBroadcastRunning(io, verified, "The launcher closed after verification.");
    if (!(await io.waitReady(session, plan))) {
      return leaveBroadcastRunning(io, verified, "The helper did not confirm raw/noecho mode; it was not exposed.");
    }
    if (io.cancelled())
      return leaveBroadcastRunning(io, verified, "The launcher closed before the helper was exposed.");

    const overlay = io.open(address);
    if (!overlay) return leaveBroadcastRunning(io, verified, "Herdr did not return an overlay ID.");
    const active = { ...verified, phase: "active" as const };
    if (!io.setActive(active))
      return leaveBroadcastRunning(io, verified, "The ownership receipt changed after opening.");
    return { kind: "opened", session, overlay };
  } catch (error) {
    if (!attempted) {
      io.clearActive(token);
      throw error;
    }
    if (confirmedEnded) throw error;
    const evidence = errorMessage(error);
    const uncertain = { ...initial, phase: "uncertain" as const, ...(session ? { session } : {}), evidence };
    io.setActive(uncertain);
    const inspect = session ? `hc get ${session.address}` : "hc ls --all";
    throw new Error(
      `Broadcast launch outcome is uncertain; no automatic retry or cleanup was attempted. ${evidence} Inspect with: ${inspect}`,
    );
  }
}

function reconcileBroadcast(
  io: BroadcastLifecycleIO,
  plan: BroadcastPlan,
  previous: BroadcastActiveRecord,
): Promise<BroadcastLaunchResult> {
  return (async () => {
    if (!previous.session) {
      throw new Error(`A broadcast launch is unresolved. Do not retry; inspect with: hc ls --all`);
    }
    if (!sameBroadcastPlan(previous.plan, plan)) {
      throw new Error(
        `Broadcast helper ${previous.session.address} belongs to another frozen scope. Inspect with: hc get ${previous.session.address}`,
      );
    }
    const inspection = await io.inspect(previous.session, previous.plan);
    if (inspection.kind === "gone" || inspection.kind === "finished") {
      io.clearActive(previous.token);
      throw new Error("The previous broadcast helper has exited. Retry only through an explicit new launch.");
    }
    if (
      inspection.kind !== "live-owned" ||
      (previous.session.pid !== undefined && previous.session.pid !== inspection.pid) ||
      (previous.session.createdMs !== undefined && previous.session.createdMs !== inspection.createdMs)
    ) {
      throw new Error(
        `Broadcast helper ${previous.session.address} was left untouched (${inspection.kind}). Inspect with: hc get ${previous.session.address}`,
      );
    }
    if (io.cancelled()) return null;
    const session = { ...previous.session, pid: inspection.pid, createdMs: inspection.createdMs };
    if (!(await io.waitReady(session, plan))) {
      throw new Error(`Broadcast helper ${session.address} did not confirm raw/noecho mode; it was not exposed.`);
    }
    if (io.cancelled()) return null;
    const overlay = io.open(session.address);
    if (!overlay) throw new Error(`Could not reopen broadcast helper. Inspect with: hc get ${session.address}`);
    const active = { ...previous, session, phase: "active" as const };
    if (!io.setActive(active)) {
      throw new Error(
        `Broadcast helper ${previous.session.address} remains running; its receipt changed. Inspect with: hc get ${previous.session.address}`,
      );
    }
    return { kind: "opened-existing", session, overlay };
  })();
}

function leaveBroadcastRunning(
  io: BroadcastLifecycleIO,
  record: BroadcastActiveRecord,
  evidence: string,
): BroadcastLaunchResult {
  const uncertain = { ...record, phase: "uncertain" as const, evidence };
  if (!io.setActive(uncertain)) io.claimActive(uncertain);
  if (!record.session) return null;
  return { kind: "left-running", session: record.session, evidence };
}

function parseActiveRecord(value: unknown): BroadcastActiveRecord | null {
  if (value === null || value === undefined) return null;
  if (
    !isRecord(value) ||
    value.schema !== 1 ||
    typeof value.token !== "string" ||
    !/^[a-z0-9-]{8,64}$/.test(value.token) ||
    !["starting", "opening", "active", "uncertain"].includes(String(value.phase)) ||
    !isBroadcastPlan(value.plan)
  ) {
    throw new Error("A previous broadcast receipt is malformed. Do not retry; inspect with: hc ls --all");
  }
  const record = value as unknown as BroadcastActiveRecord;
  if (record.session !== undefined) {
    const session = record.session;
    if (
      !isRecord(session) ||
      session.token !== record.token ||
      typeof session.address !== "string" ||
      !/^t[a-z0-9]+$/.test(session.address) ||
      (session.pid !== undefined && (typeof session.pid !== "number" || session.pid <= 0)) ||
      (session.createdMs !== undefined && (typeof session.createdMs !== "number" || session.createdMs <= 0))
    ) {
      throw new Error("A previous broadcast session receipt is malformed. Do not retry; inspect with: hc ls --all");
    }
  }

  return record;
}

function isBroadcastPlan(value: unknown): value is BroadcastPlan {
  return (
    isRecord(value) &&
    isCoreId(value.coreId) &&
    typeof value.space === "string" &&
    typeof value.tab === "string" &&
    Array.isArray(value.targets) &&
    typeof value.cwd === "string" &&
    typeof value.script === "string" &&
    Array.isArray(value.command) &&
    value.command.every((item) => typeof item === "string") &&
    Array.isArray(value.args) &&
    value.args.every((item) => typeof item === "string") &&
    Array.isArray(value.dependencies) &&
    value.dependencies.every((item) => typeof item === "string")
  );
}

function sameBroadcastPlan(left: BroadcastPlan, right: BroadcastPlan): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

export function broadcastOverlay(address: string): Record<string, unknown> {
  if (!/^t[a-z0-9]+$/.test(address)) throw new Error("Broadcast terminal address is invalid.");
  return {
    kind: "dialog",
    width: 0.92,
    height: 0.85,
    layout: {
      type: "column",
      children: [
        {
          id: "broadcast-scope",
          type: "block",
          size: { px: 52 },
          content: { mod: "peek", props: { terminal: address } },
        },
        { id: "broadcast-terminal", type: "block", content: { terminal: address } },
      ],
    },
  };
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function absoluteDirectory(value: unknown, label: string): string {
  if (typeof value !== "string" || !value.startsWith("/") || value.includes("\0")) {
    throw new Error(`${label} must be an absolute local path.`);
  }
  return value.replace(/\/+$/, "") || "/";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isLocalId(value: unknown): value is string {
  return typeof value === "string" && value.length > 0 && !value.includes("/");
}

function isLocalPane(value: unknown): value is string {
  return typeof value === "string" && /^p[a-z0-9]+$/.test(value);
}

function isLocalTerminal(value: unknown): value is string {
  return typeof value === "string" && /^t[a-z0-9]+$/.test(value);
}

function isCoreId(value: unknown): value is string {
  return typeof value === "string" && /^[a-f0-9]{32}$/.test(value);
}
