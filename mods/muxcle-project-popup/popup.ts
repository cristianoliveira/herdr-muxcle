export const POPUP_OWNER_LABEL = "muxcle.project-popup.owner.v1";
const ACTIVE_SCHEMA = 1;
export const POPUP_ACTIVE_KEY = "muxcle-project-popup.active.v1";

export interface PopupPlan {
  space: string;
  tab: string;
  pane: string;
  terminal: string;
  cwd: string;
  script: string;
}

export interface PopupSession {
  address: string;
  token: string;
  coreId: string;
  cwd: string;
  script: string;
  argv: string[];
}

export interface PopupReceipt extends PopupSession {
  state: "live" | "finished";
  keep: false;
}

export interface PopupActiveRecord {
  schema: 1;
  token: string;
  phase: "starting" | "uncertain" | "opening" | "active";
  coreId?: string;
  session?: PopupSession;
  evidence?: string;
}

export interface CoreResult {
  code: number;
  stdout: string;
  stderr: string;
}

export type PopupCore = (args: string[]) => Promise<CoreResult>;

export interface PopupIO {
  active(): unknown;
  claimActive(record: PopupActiveRecord): boolean;
  setActive(record: PopupActiveRecord): boolean;
  clearActive(token: string): void;
  check(script: string, cwd: string): Promise<{ shellAvailable: boolean; exists: boolean; executable: boolean }>;
  core: PopupCore;
  isContextCurrent(): boolean;
  isCancelled(): boolean;
  open(spec: Record<string, unknown>): string | null;
}

export type PopupInspection =
  | { kind: "live-owned" }
  | { kind: "gone" }
  | { kind: "finished" }
  | { kind: "kept" }
  | { kind: "foreign-core" }
  | { kind: "unowned" };

export function popupPlan(focus: unknown, spaces: unknown, panes: unknown): PopupPlan {
  if (!isRecord(focus) || !Array.isArray(spaces) || !Array.isArray(panes)) {
    throw new Error("Focus a normal local terminal with a known absolute project folder first.");
  }

  const { space: spaceId, tab, pane, terminal, cwd, shown } = focus;
  const normalizedCwd = normalizedLocalCwd(cwd);
  if (normalizedCwd === null) {
    throw new Error("Project popups require an absolute POSIX cwd without `..` or leading `//` components.");
  }
  if (
    typeof spaceId !== "string" ||
    typeof tab !== "string" ||
    typeof pane !== "string" ||
    typeof terminal !== "string" ||
    !isLocalAddress(terminal) ||
    shown !== null
  ) {
    throw new Error("Focus a normal local terminal with a known absolute POSIX project folder first.");
  }

  const space = spaces.find((candidate) => isRecord(candidate) && candidate.id === spaceId);
  if (!isRecord(space) || space.machine !== null || space.active !== true) {
    throw new Error("Project popups require the active local space; remote and unknown contexts are refused.");
  }

  const activeTab = Array.isArray(space.tabs)
    ? space.tabs.find((candidate) => isRecord(candidate) && candidate.id === tab && candidate.active === true)
    : null;
  const activePane = panes.find(
    (candidate) =>
      isRecord(candidate) &&
      candidate.pane === pane &&
      candidate.terminal === terminal &&
      candidate.tab === tab &&
      normalizedLocalCwd(candidate.cwd) === normalizedCwd,
  );
  if (!activeTab || !activePane) {
    throw new Error("The focused terminal no longer matches its active space, tab, and pane. Refocus it and retry.");
  }

  const script = projectScript(normalizedCwd);
  return { space: spaceId, tab, pane, terminal, cwd: normalizedCwd, script };
}

export function popupRunArgs(plan: PopupPlan, token: string): string[] {
  if (!/^[a-z0-9-]{8,}$/u.test(token)) throw new Error("Popup ownership token is invalid.");
  // hc run treats one shell-looking operand as a line; use fixed absolute sh and pass the path as $1.
  return [
    "run",
    "--bg",
    "--json",
    "--no-parent",
    "--no-notify",
    "--rm",
    "--label",
    `${POPUP_OWNER_LABEL}=${token}`,
    "--cwd",
    plan.cwd,
    "--",
    "/bin/sh",
    "-c",
    'exec "$1"',
    "muxcle-project-popup",
    plan.script,
  ];
}

export function popupOverlay(session: PopupSession): Record<string, unknown> {
  return {
    kind: "dialog",
    width: 0.8,
    height: 0.8,
    layout: {
      type: "column",
      children: [
        {
          id: "project-popup-header",
          type: "block",
          size: { px: 36 },
          content: { mod: "peek", props: { terminal: session.address } },
        },
        {
          id: "project-popup-terminal",
          type: "block",
          content: { terminal: session.address },
        },
      ],
    },
  };
}

export type PopupOpenResult =
  | { kind: "opened"; session: PopupSession; overlay: string }
  | { kind: "left-running"; session: PopupSession; evidence: string };

export async function openPopup(plan: PopupPlan, io: PopupIO, token: string): Promise<PopupOpenResult | null> {
  if (!/^[a-z0-9-]{8,}$/u.test(token)) throw new Error("Popup ownership token is invalid.");
  if (io.active()) await rejectOrReconcileActive(io);
  if (io.active()) throw new Error("A project popup is already starting or its previous state is unresolved.");
  if (!io.claimActive({ schema: ACTIVE_SCHEMA, token, phase: "starting" })) {
    throw new Error("A project popup was claimed by another launcher. Retry only after it is reconciled.");
  }

  let runStarted = false;
  let session: PopupSession | null = null;
  try {
    const scriptStatus = await io.check(plan.script, plan.cwd);
    assertActiveClaim(io, token);
    if (!scriptStatus.shellAvailable) {
      throw new Error("Project popup requires an executable POSIX shell at /bin/sh.");
    }
    if (!scriptStatus.exists) {
      throw new Error(
        `No project popup exists at ${plan.script}. Create it with a POSIX shebang, then run: mkdir -p .tmp && printf '#!/bin/sh\\n' > .tmp/popup && chmod +x .tmp/popup`,
      );
    }
    if (!scriptStatus.executable) {
      throw new Error(
        `Project popup ${plan.script} is not executable. From the project root, run: chmod +x .tmp/popup`,
      );
    }

    if (io.isCancelled()) {
      io.clearActive(token);
      return null;
    }
    if (!io.isContextCurrent())
      throw new Error("The focused terminal changed before launch; no project script was run.");

    const coreId = await readCoreId(io.core);
    if (!io.setActive({ schema: ACTIVE_SCHEMA, token, phase: "starting", coreId })) {
      throw new Error("The project popup ownership claim changed before launch.");
    }
    if (io.isCancelled()) {
      io.clearActive(token);
      return null;
    }
    if (!io.isContextCurrent())
      throw new Error("The focused terminal changed before launch; no project script was run.");

    runStarted = true;
    const receipt = readData(await io.core(popupRunArgs(plan, token)), "launch");
    const validated = validateReceipt(receipt, plan, token, coreId);
    if (validated.state === "finished") {
      io.clearActive(token);
      return null;
    }

    session = validated;
    if (!io.setActive({ schema: ACTIVE_SCHEMA, token, phase: "opening", coreId, session })) {
      return leavePopupRunning(
        io,
        token,
        session,
        "The popup ownership claim changed after launch; the verified terminal was left running.",
      );
    }

    const inspection = await inspectPopup(session, io.core);
    if (!ownsActiveClaim(io, token)) {
      return leavePopupRunning(
        io,
        token,
        session,
        "The popup ownership claim changed after inspection; the terminal was left running.",
      );
    }
    if (inspection.kind === "gone" || inspection.kind === "finished") {
      io.clearActive(token);
      return null;
    }
    if (inspection.kind !== "live-owned") {
      return leavePopupRunning(
        io,
        token,
        session,
        `The created terminal could not be re-verified (${inspection.kind}); no automatic stop was attempted.`,
      );
    }

    if (io.isCancelled() || !io.isContextCurrent()) {
      return leavePopupRunning(
        io,
        token,
        session,
        "The launcher closed or focus changed after launch; the terminal was left running because Herdr cannot atomically verify ownership while stopping it.",
      );
    }

    const overlay = io.open(popupOverlay(session));
    if (!overlay) {
      return leavePopupRunning(
        io,
        token,
        session,
        "Herdr did not return an overlay ID; the terminal was left running.",
      );
    }
    const active = io.active();
    if (isRecord(active) && active.token === token) {
      io.setActive({ schema: ACTIVE_SCHEMA, token, phase: "active", coreId, session });
    }
    return { kind: "opened", session, overlay };
  } catch (error) {
    if (!runStarted) {
      io.clearActive(token);
      throw error;
    }

    if (!session) {
      const evidence = errorMessage(error);
      io.setActive({ schema: ACTIVE_SCHEMA, token, phase: "uncertain", evidence });
      throw new Error(
        `Project popup launch is uncertain: ${evidence}. No automatic retry or cleanup was attempted because no verified terminal receipt is available. Inspect with: hc ls --all`,
      );
    }

    return leavePopupRunning(io, token, session, `${errorMessage(error)}; no automatic stop was attempted.`);
  }
}

function assertActiveClaim(io: PopupIO, token: string): void {
  if (!ownsActiveClaim(io, token)) {
    throw new Error("The project popup ownership claim changed before launch.");
  }
}

function ownsActiveClaim(io: PopupIO, token: string): boolean {
  const active = io.active();
  return isRecord(active) && active.schema === ACTIVE_SCHEMA && active.token === token;
}

function leavePopupRunning(io: PopupIO, token: string, session: PopupSession, evidence: string): PopupOpenResult {
  io.setActive({ schema: ACTIVE_SCHEMA, token, phase: "uncertain", coreId: session.coreId, session, evidence });
  return { kind: "left-running", session, evidence };
}

export function updateActiveIfOwned(
  readActive: () => unknown,
  writeActive: (record: PopupActiveRecord) => void,
  record: PopupActiveRecord,
): boolean {
  const current = readActive();
  if (!isRecord(current) || current.schema !== ACTIVE_SCHEMA || current.token !== record.token) return false;
  writeActive(record);
  return true;
}

export async function inspectPopup(session: PopupSession, core: PopupCore): Promise<PopupInspection> {
  const coreId = await readCoreId(core);
  if (coreId !== session.coreId) return { kind: "foreign-core" };

  const result = await core(["get", "--json", session.address]);
  const value = parseReply(result);
  const error = isRecord(value.error) ? value.error : null;
  if (error?.kind === "not_found") return { kind: "gone" };
  if (result.code !== 0 || error) throw coreError(value, result, "inspect terminal");

  const record = value;
  if (record.address !== session.address) return { kind: "unowned" };
  if (record.state === "finished") return { kind: "finished" };
  if (record.state !== "live") return { kind: "unowned" };
  if (record.keep === true) return { kind: "kept" };
  if (record.keep !== false && record.keep !== undefined) return { kind: "unowned" };
  if (!matchesOwnership(record, session)) return { kind: "unowned" };
  return { kind: "live-owned" };
}

function validateReceipt(
  receipt: Record<string, unknown>,
  plan: PopupPlan,
  token: string,
  coreId: string,
): PopupReceipt {
  const address = receipt.address;
  const state = receipt.state;
  const argv = receipt.argv;
  const labels = isRecord(receipt.labels) ? receipt.labels : null;
  if (typeof address !== "string" || !isLocalAddress(address)) {
    throw new Error("Core returned an invalid local terminal address.");
  }
  if (state !== "live" && state !== "finished") throw new Error("Core returned a malformed terminal state.");
  if (
    labels?.[POPUP_OWNER_LABEL] !== token ||
    receipt.cwd !== plan.cwd ||
    !sameStrings(argv, popupScriptArgv(plan.script)) ||
    (receipt.keep !== false && receipt.keep !== undefined) ||
    (receipt.parent !== null && receipt.parent !== undefined)
  ) {
    throw new Error(`Core returned an unverified receipt for ${address}.`);
  }

  return {
    address,
    token,
    coreId,
    cwd: plan.cwd,
    script: plan.script,
    argv: [...argv],
    state,
    keep: false,
  };
}

function matchesOwnership(record: Record<string, unknown>, session: PopupSession): boolean {
  const labels = isRecord(record.labels) ? record.labels : null;
  return (
    labels?.[POPUP_OWNER_LABEL] === session.token &&
    record.cwd === session.cwd &&
    sameStrings(record.argv, session.argv) &&
    sameStrings(session.argv, popupScriptArgv(session.script))
  );
}

async function rejectOrReconcileActive(io: PopupIO): Promise<void> {
  const value = io.active();
  if (value === null || value === undefined) return;

  const active = parseActive(value);
  if (!active?.session) {
    throw new Error(
      "A previous project popup launch has no verifiable receipt. Do not retry automatically; inspect Herdr terminals with: hc ls --all",
    );
  }

  const inspection = await inspectPopup(active.session, io.core);
  if (inspection.kind === "gone" || inspection.kind === "finished") {
    io.clearActive(active.token);
    return;
  }
  if (inspection.kind === "kept") {
    throw new Error(
      `Previous project popup ${active.session.address} is kept and was left running. Inspect with: hc get ${active.session.address}`,
    );
  }
  throw new Error(
    `A project popup is already active or its ownership is uncertain (${active.session.address}, ${inspection.kind}). Inspect with: hc get ${active.session.address}`,
  );
}

async function readCoreId(core: PopupCore): Promise<string> {
  const status = readData(await core(["server", "status", "--json"]), "read core identity");
  if (!isRecord(status.core) || typeof status.core.id !== "string" || status.core.id.length === 0) {
    throw new Error("Herdr did not return a stable core identity.");
  }
  return status.core.id;
}

function readData(result: CoreResult, operation: string): Record<string, unknown> {
  const value = parseReply(result);
  if (result.code !== 0 || value.error) throw coreError(value, result, operation);
  return value;
}

function parseReply(result: CoreResult): Record<string, unknown> {
  for (const output of [result.stdout, result.stderr]) {
    if (!output.trim()) continue;
    try {
      const parsed: unknown = JSON.parse(output);
      if (isRecord(parsed)) return parsed;
    } catch {
      // Try the other stream before reporting malformed output.
    }
  }
  throw new Error(result.stderr.trim() || "Herdr returned an invalid JSON reply.");
}

function coreError(value: Record<string, unknown>, result: CoreResult, operation: string): Error {
  const error = isRecord(value.error) ? value.error : null;
  const message = typeof error?.message === "string" ? error.message : "";
  return new Error(message || result.stderr.trim() || `Herdr could not ${operation}.`);
}

function parseActive(value: unknown): PopupActiveRecord | null {
  if (!isRecord(value) || value.schema !== ACTIVE_SCHEMA || typeof value.token !== "string") return null;
  const phase = value.phase;
  if (phase !== "starting" && phase !== "uncertain" && phase !== "opening" && phase !== "active") return null;

  const active: PopupActiveRecord = { schema: ACTIVE_SCHEMA, token: value.token, phase };
  if (typeof value.coreId === "string") active.coreId = value.coreId;
  if (typeof value.evidence === "string") active.evidence = value.evidence;
  const session = parsePopupSession(value.session);
  if (session && session.token === active.token && (!active.coreId || session.coreId === active.coreId)) {
    active.session = session;
  }
  return active;
}

export function parsePopupSession(value: unknown): PopupSession | null {
  if (!isRecord(value)) return null;
  const { address, token, coreId, cwd, script, argv } = value;
  if (
    typeof address !== "string" ||
    !isLocalAddress(address) ||
    typeof token !== "string" ||
    !/^[a-z0-9-]{8,}$/u.test(token) ||
    typeof coreId !== "string" ||
    coreId.length === 0 ||
    typeof cwd !== "string" ||
    normalizedLocalCwd(cwd) !== cwd ||
    typeof script !== "string" ||
    script !== projectScript(cwd) ||
    !sameStrings(argv, popupScriptArgv(script))
  ) {
    return null;
  }
  return { address, token, coreId, cwd, script, argv };
}

function popupScriptArgv(script: string): string[] {
  return ["/bin/sh", "-c", 'exec "$1"', "muxcle-project-popup", script];
}

function normalizedLocalCwd(value: unknown): string | null {
  if (typeof value !== "string" || !value.startsWith("/") || value.startsWith("//")) return null;

  const components: string[] = [];
  for (const component of value.split("/")) {
    if (component === "..") return null;
    if (component && component !== ".") components.push(component);
  }
  return `/${components.join("/")}`;
}

function projectScript(cwd: string): string {
  const normalized = cwd.replace(/\/+$/u, "") || "/";
  return `${normalized === "/" ? "" : normalized}/.tmp/popup`;
}

function isLocalAddress(address: string): boolean {
  return /^t[a-z0-9]+$/u.test(address);
}

function sameStrings(value: unknown, expected: string[]): value is string[] {
  return (
    Array.isArray(value) && value.length === expected.length && value.every((item, index) => item === expected[index])
  );
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
