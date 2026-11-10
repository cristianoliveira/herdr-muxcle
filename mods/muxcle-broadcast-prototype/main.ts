import { h_flex, v_flex } from "gpui-base";
import { View, div, type AsyncContext, type Context, type NativeElement } from "gpui-kit";
import {
  appHome,
  closeOverlay,
  exec,
  focused,
  hc,
  home,
  openOverlay,
  panes,
  props,
  setShared,
  shared,
  spaces,
  terminals,
  theme,
  type OverlaySpec,
} from "herdr";
import {
  BROADCAST_ACTIVE_KEY,
  BROADCAST_LABEL,
  broadcastHelperArgs,
  broadcastOverlay,
  broadcastPlan,
  broadcastRunArgs,
  captureBroadcastTargets,
  checkBroadcastDependencies,
  launchBroadcast,
  waitForBroadcastReady,
  type BroadcastActiveRecord,
  type BroadcastPlan,
  type BroadcastSession,
  type BroadcastTarget,
} from "./broadcast.js";

const MOD_NAME = "muxcle-broadcast-prototype";

export default class MuxcleBroadcastPrototype extends View {
  private launcherOverlay: string | null = null;
  private preview: { space: string; tab: string; targets: BroadcastTarget[] } | null = null;
  private previewError: string | null = null;
  private status = "Input is not sent until you choose Start.";
  private starting = false;
  private dismissed = false;
  private cancelled = false;

  init(viewProps: Record<string, unknown> | null | undefined): void {
    const values = viewProps ?? props() ?? {};
    this.launcherOverlay = typeof values.overlay === "string" ? values.overlay : null;
    this.refreshPreview();
  }

  render(): NativeElement {
    this.refreshPreview();
    const palette = theme();
    const activeRecord = shared(BROADCAST_ACTIVE_KEY);
    const root = v_flex()
      .id(MOD_NAME)
      .w(640)
      .h(440)
      .p(16)
      .gap(12)
      .bg(palette.popover ?? palette.background)
      .border_1()
      .border_color(palette.border ?? palette.muted)
      .rounded(12)
      .child(
        h_flex()
          .items_center()
          .justify_between()
          .child(
            div().text_size(16).font_semibold().text_color(palette.foreground).child("Broadcast input · Prototype"),
          )
          .child(this.action("Close · Esc", palette.muted, () => this.closeLauncher())),
      )
      .child(
        div()
          .text_color(palette.foreground)
          .child("Relays supported keystrokes to a frozen set of 2–8 live local terminal panes."),
      )
      .child(
        div()
          .text_size(12)
          .text_color(palette.muted)
          .child("Not synchronized: targets receive input sequentially; partial delivery cannot be rolled back."),
      )
      .child(
        div()
          .text_size(12)
          .text_color(palette.muted)
          .child("No IME, paste, Alt, function-key or advanced keyboard support. Escape exits."),
      )
      .child(
        div()
          .text_size(12)
          .text_color(palette.dim ?? palette.muted)
          .child(this.scopeView(palette.dim ?? palette.muted)),
      );

    if (this.previewError) {
      root.child(
        div()
          .text_color(palette.error ?? palette.accent)
          .child(this.previewError),
      );
    }
    root.child(div().text_size(12).text_color(palette.muted).child(this.status));
    if (activeRecord !== null && activeRecord !== undefined) {
      root.child(
        div()
          .text_size(12)
          .text_color(palette.error ?? palette.accent)
          .child("A previous broadcast receipt blocks new launches until it is reconciled. Inspect with: hc ls --all"),
      );
    }
    if (this.preview && !this.starting) {
      root.child(this.action("Start broadcast prototype", palette.accent, (cx) => this.start(cx)));
    } else if (this.starting) {
      root.child(div().text_color(palette.muted).child("Verifying Core, target processes and Python curses…"));
    }
    return root;
  }

  close(): void {
    this.dismissed = true;
    this.cancelled = true;
  }

  private action(label: string, color: string, onClick: (cx: Context) => void): NativeElement {
    return div()
      .cursor_pointer()
      .rounded(6)
      .px(12)
      .py(7)
      .bg(color)
      .text_color(theme().background)
      .font_semibold()
      .on_click((_event, cx) => onClick(cx))
      .child(label);
  }

  private refreshPreview(): void {
    try {
      this.preview = captureBroadcastTargets(focused(), spaces(), panes(), terminals());
      this.previewError = null;
    } catch (error) {
      this.preview = null;
      this.previewError = errorMessage(error);
    }
  }

  private scopeView(color: string): NativeElement {
    if (!this.preview) {
      return div().text_size(12).text_color(color).child("Focus an ordinary local terminal pane in an active tab.");
    }
    const targets = this.preview.targets.map(({ pane, terminal }) =>
      div().text_size(12).text_color(color).child(`Pane ${pane} · terminal ${terminal}`),
    );
    return v_flex()
      .gap(4)
      .child(div().text_size(12).text_color(color).child(`Captured scope: ${this.preview.space} / ${this.preview.tab}`))
      .children(targets);
  }

  private start(cx: Context): void {
    if (this.starting || this.dismissed || !this.preview) return;

    const reviewed = this.preview;
    this.starting = true;
    this.cancelled = false;
    this.status = "Reviewing the frozen target set…";
    cx.notify();
    const token = createToken();

    cx.spawn(
      async (taskCx: AsyncContext) => {
        try {
          const result = await launchBroadcast(
            true,
            async () => {
              const current = this.captureAgain();
              if (!sameCapture(reviewed, current)) {
                throw new Error("Tab targets changed after review. Close and reopen to review the current set.");
              }
              const coreId = await readCoreId();
              const plan = broadcastPlan(current, appHome(), home(), coreId);
              await checkBroadcastDependencies(plan, exec);
              if (this.cancelled) return null;

              const latest = this.captureAgain();
              if (!sameCapture(reviewed, latest)) {
                throw new Error("Tab targets changed during verification. Close and reopen to review the current set.");
              }
              return plan;
            },
            this.createIO(),
            token,
          );
          this.starting = false;
          if (!result) return;

          if (result.kind === "left-running") {
            this.status = `Helper left running: ${result.evidence} Inspect with: hc get ${result.session.address}`;
            taskCx.notify();
            return;
          }
          this.status =
            result.kind === "opened-existing"
              ? `Reopened the verified broadcast helper ${result.session.address}.`
              : `Opening reviewed scope in ${result.session.address}. Wait for READY before typing.`;
          if (this.launcherOverlay) closeOverlay(this.launcherOverlay);
        } catch (error) {
          this.starting = false;
          this.status = errorMessage(error);
          taskCx.notify();
        } finally {
          this.starting = false;
          if (!this.dismissed) taskCx.notify();
        }
      },
      { owner: null },
    );
  }

  private createIO() {
    return {
      active: () => shared(BROADCAST_ACTIVE_KEY),
      claimActive: (record: BroadcastActiveRecord) => claimActive(record),
      setActive: (record: BroadcastActiveRecord) => setActive(record),
      clearActive: (token: string) => clearActive(token),
      launch: async (plan: BroadcastPlan, token: string) => parseRunReceipt(await hc(broadcastRunArgs(plan, token))),
      inspect: inspectHelper,
      waitReady: (session: BroadcastSession, plan: BroadcastPlan) =>
        waitForBroadcastReady(session, plan, exec, () => this.cancelled),
      open: (address: string) => openOverlay(broadcastOverlay(address) as OverlaySpec),
      cancelled: () => this.cancelled,
    };
  }

  private captureAgain(): { space: string; tab: string; targets: BroadcastTarget[] } {
    return captureBroadcastTargets(focused(), spaces(), panes(), terminals());
  }

  private closeLauncher(): void {
    this.dismissed = true;
    this.cancelled = true;
    if (this.launcherOverlay) closeOverlay(this.launcherOverlay);
  }
}

async function readCoreId(): Promise<string> {
  const result = await hc(["server", "status", "--json"]);
  const data = readJsonCommand(result, "Core status");
  const id = isRecord(data) && isRecord(data.core) ? data.core.id : null;
  if (typeof id !== "string" || !/^[a-f0-9]{32}$/.test(id)) {
    throw new Error("Core status did not include a valid Core identity.");
  }
  return id;
}

function parseRunReceipt(result: { code: number; stdout: string; stderr: string }): string {
  const data = readJsonCommand(result, "Core launch");
  const address = isRecord(data) ? data.address : null;
  if (typeof address !== "string" || !/^t[a-z0-9]+$/.test(address)) {
    throw new Error("Core returned an invalid local broadcast helper address.");
  }
  return address;
}

async function inspectHelper(
  session: BroadcastSession,
  plan: BroadcastPlan,
): Promise<{ kind: "live-owned" | "gone" | "finished" | "unowned"; pid?: number; createdMs?: number }> {
  if ((await readCoreId()) !== plan.coreId) return { kind: "unowned" };
  const result = await hc(["get", "--json", session.address]);
  const terminal = parseOptionalJson(result.stdout, result.stderr);
  if (result.code !== 0) {
    return isNotFound(terminal) ? { kind: "gone" } : { kind: "unowned" };
  }
  if (!isRecord(terminal) || terminal.address !== session.address) return { kind: "unowned" };

  const expectedArgv = [...plan.command, ...broadcastHelperArgs(plan, session.token)];
  const argv = isStringArray(terminal.argv) ? terminal.argv : null;
  const owned =
    argv !== null &&
    argv.length === expectedArgv.length &&
    expectedArgv.every((arg, index) => argv[index] === arg) &&
    isRecord(terminal.labels) &&
    terminal.labels[BROADCAST_LABEL] === session.token &&
    terminal.rm === true &&
    terminal.keep === false &&
    terminal.parent === null;
  if (!owned) return { kind: "unowned" };
  if (terminal.state === "finished") return { kind: "finished" };
  if (
    terminal.state !== "live" ||
    typeof terminal.pid !== "number" ||
    terminal.pid <= 0 ||
    typeof terminal.created_ms !== "number" ||
    !Number.isInteger(terminal.created_ms) ||
    terminal.created_ms <= 0
  )
    return { kind: "unowned" };
  if (
    (session.pid !== undefined && session.pid !== terminal.pid) ||
    (session.createdMs !== undefined && session.createdMs !== terminal.created_ms)
  )
    return { kind: "unowned" };
  return { kind: "live-owned", pid: terminal.pid, createdMs: terminal.created_ms };
}

function clearActive(token: string): void {
  const current = shared(BROADCAST_ACTIVE_KEY);
  if (isRecord(current) && current.token === token) setShared(BROADCAST_ACTIVE_KEY, null);
}

function claimActive(record: BroadcastActiveRecord): boolean {
  const current = shared(BROADCAST_ACTIVE_KEY);
  if (current !== null && current !== undefined) return false;
  setShared(BROADCAST_ACTIVE_KEY, record);
  return true;
}

function setActive(record: BroadcastActiveRecord): boolean {
  const current = shared(BROADCAST_ACTIVE_KEY);
  if (!isRecord(current) || current.schema !== 1 || current.token !== record.token) return false;
  setShared(BROADCAST_ACTIVE_KEY, record);
  return true;
}

function parseOptionalJson(stdout: string, stderr: string): unknown {
  for (const output of [stdout, stderr]) {
    if (!output.trim()) continue;
    try {
      return JSON.parse(output);
    } catch {
      // Try the other stream before deciding that the result is unstructured.
    }
  }
  return null;
}

function isNotFound(value: unknown): boolean {
  return isRecord(value) && isRecord(value.error) && value.error.kind === "not_found";
}

function readJsonCommand(result: { code: number; stdout: string; stderr: string }, label: string): unknown {
  if (result.code !== 0) throw new Error(`${label} failed: ${result.stderr || "unknown Core error"}`);
  try {
    return JSON.parse(result.stdout);
  } catch {
    throw new Error(`${label} returned invalid JSON.`);
  }
}

function sameCapture(
  left: { space: string; tab: string; targets: BroadcastTarget[] },
  right: { space: string; tab: string; targets: BroadcastTarget[] },
): boolean {
  return (
    left.space === right.space &&
    left.tab === right.tab &&
    JSON.stringify(left.targets) === JSON.stringify(right.targets)
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string");
}

function createToken(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 16)}`;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
