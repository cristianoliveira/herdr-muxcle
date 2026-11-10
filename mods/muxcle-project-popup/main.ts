import { h_flex, v_flex } from "gpui-base";
import { View, div, type AsyncContext, type Context, type NativeElement } from "gpui-kit";
import {
  closeOverlay,
  exec,
  focused,
  hc,
  notify,
  openOverlay,
  panes,
  props,
  setShared,
  shared,
  spaces,
  theme,
  type OverlaySpec,
} from "herdr";
import {
  POPUP_ACTIVE_KEY,
  openPopup,
  parsePopupSession,
  popupPlan,
  updateActiveIfOwned,
  type PopupActiveRecord,
  type PopupIO,
  type PopupPlan,
} from "./popup.js";

const MOD_NAME = "muxcle-project-popup";

export default class MuxcleProjectPopup extends View {
  private launcherOverlay: string | null = null;
  private launchError: string | null = null;
  private launchStatus: string | null = null;
  private planError: string | null = null;
  private launching = false;
  private cancelled = false;
  private dismissed = false;
  private transferred = false;

  init(viewProps: Record<string, unknown> | null | undefined): void {
    const values = viewProps ?? props() ?? {};
    this.launcherOverlay = typeof values.overlay === "string" ? values.overlay : null;
  }

  render(): NativeElement {
    return this.renderLauncher();
  }

  close(): void {
    this.dismissed = true;
    if (!this.transferred) this.cancelled = true;
  }

  private renderLauncher(): NativeElement {
    const palette = theme();
    const plan = this.currentPlan();
    const active = shared(POPUP_ACTIVE_KEY);
    const activeRecord = isRecord(active) ? active : null;
    const activeSession = parsePopupSession(activeRecord?.session);
    const canLaunch = plan !== null && !this.launching;

    let contextDescription = plan?.script ?? this.planError ?? "Focus a normal local terminal first.";
    if (this.launching) contextDescription = "Checking the project script and preparing an owned terminal…";
    if (activeRecord) {
      const address = activeSession?.address;
      contextDescription = address
        ? `A previous popup state needs reconciliation. Inspect its terminal with: hc get ${address}`
        : "A previous popup launch is unresolved. Inspect Herdr terminals with: hc ls --all";
    }

    const root = v_flex()
      .id(MOD_NAME)
      .w(560)
      .h(252)
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
          .child(div().text_size(16).font_semibold().text_color(palette.foreground).child("Project popup"))
          .child(this.action("Close", palette.muted, () => this.closeLauncher())),
      )
      .child(
        div()
          .text_color(palette.foreground)
          .child("Runs only after you choose Run. Herdr will not preview or execute the project script automatically."),
      )
      .child(
        div()
          .text_size(12)
          .text_color(palette.muted)
          .child(
            "Project code runs with your user permissions and may use files or network access available to Herdr.",
          ),
      )
      .child(
        div()
          .text_size(12)
          .text_color(palette.dim ?? palette.muted)
          .child(`Script path: ${plan?.script ?? ".tmp/popup"}`),
      )
      .child(
        div()
          .text_size(12)
          .text_color(activeRecord ? (palette.warning ?? palette.accent) : palette.muted)
          .child(contextDescription),
      );

    if (this.launchError) {
      root.child(
        div()
          .text_color(palette.error ?? palette.accent)
          .child(this.launchError),
      );
    } else if (this.launchStatus) {
      root.child(div().text_color(palette.muted).child(this.launchStatus));
    }

    if (canLaunch) {
      const label = this.launching ? "Starting…" : activeRecord ? "Verify previous state, then Run" : "Run .tmp/popup";
      root.child(this.action(label, palette.accent, (cx) => this.start(plan, cx)));
    }
    return root;
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

  private currentPlan(): PopupPlan | null {
    try {
      const plan = popupPlan(focused(), spaces(), panes());
      this.planError = null;
      return plan;
    } catch (error) {
      this.planError = errorMessage(error);
      return null;
    }
  }

  private start(plan: PopupPlan, cx: Context): void {
    if (this.launching || this.dismissed) return;

    this.launching = true;
    this.launchError = null;
    this.launchStatus = null;
    const token = createToken();
    cx.notify();

    // The task must survive launcher unmount to preserve the receipt and report its outcome.
    cx.spawn(
      async (taskCx: AsyncContext) => {
        try {
          const result = await openPopup(plan, this.createIO(plan), token);
          this.launching = false;

          if (!result) {
            if (!this.dismissed && !this.cancelled) {
              this.launchStatus = "The project script exited before its terminal could be displayed.";
              taskCx.notify();
            }
            return;
          }

          this.transferred = true;
          if (result.kind === "left-running") {
            this.launchStatus = `Left running in ${result.session.address}. Inspect with: hc get ${result.session.address}`;
            notify({
              title: "Project popup left running",
              body: `${result.evidence} Inspect with: hc get ${result.session.address}`,
              level: "warning",
            });
            if (!this.dismissed) taskCx.notify();
            return;
          }

          if (this.dismissed || this.cancelled) {
            closeOverlay(result.overlay);
            return;
          }

          this.launchStatus = `Running in ${result.session.address}.`;
          taskCx.notify();
          if (this.launcherOverlay) closeOverlay(this.launcherOverlay);
        } catch (error) {
          this.launching = false;
          this.launchError = errorMessage(error);
          notify({ title: "Project popup could not start", body: this.launchError, level: "error" });
          if (!this.dismissed) taskCx.notify();
        }
      },
      { owner: null },
    );
  }

  private createIO(plan: PopupPlan): PopupIO {
    return {
      active: () => shared(POPUP_ACTIVE_KEY),
      claimActive: (record) => claimActive(record),
      setActive: (record) => setActive(record),
      clearActive: (token) => clearActive(token),
      check: (script, cwd) => checkProjectScript(script, cwd),
      core: (args) => hc(args),
      isContextCurrent: () => samePlan(plan, this.currentPlan()),
      isCancelled: () => this.cancelled,
      open: (spec) => openOverlay(spec as OverlaySpec),
    };
  }

  private closeLauncher(): void {
    this.dismissed = true;
    if (!this.transferred) this.cancelled = true;
    if (this.launcherOverlay) closeOverlay(this.launcherOverlay);
  }
}

async function checkProjectScript(
  script: string,
  cwd: string,
): Promise<{ shellAvailable: boolean; exists: boolean; executable: boolean }> {
  const shell = await exec("test", ["-x", "/bin/sh"], { cwd });
  if (shell.code !== 0) return { shellAvailable: false, exists: false, executable: false };

  const file = await exec("test", ["-f", script], { cwd });
  if (file.code === 1) return { shellAvailable: true, exists: false, executable: false };
  if (file.code !== 0) throw new Error(`Could not check ${script}: ${file.stderr.trim() || `exit ${file.code}`}`);

  const executable = await exec("test", ["-x", script], { cwd });
  if (executable.code === 1) return { shellAvailable: true, exists: true, executable: false };
  if (executable.code !== 0)
    throw new Error(`Could not check ${script}: ${executable.stderr.trim() || `exit ${executable.code}`}`);
  return { shellAvailable: true, exists: true, executable: true };
}

function clearActive(token: string): void {
  const current = shared(POPUP_ACTIVE_KEY);
  if (isRecord(current) && current.token === token) setShared(POPUP_ACTIVE_KEY, null);
}

function claimActive(record: PopupActiveRecord): boolean {
  const current = shared(POPUP_ACTIVE_KEY);
  if (current !== null && current !== undefined) return false;
  setShared(POPUP_ACTIVE_KEY, record);
  return true;
}

function setActive(record: PopupActiveRecord): boolean {
  return updateActiveIfOwned(
    () => shared(POPUP_ACTIVE_KEY),
    (value) => setShared(POPUP_ACTIVE_KEY, value),
    record,
  );
}

function samePlan(left: PopupPlan, right: PopupPlan | null): boolean {
  return (
    right !== null &&
    left.space === right.space &&
    left.tab === right.tab &&
    left.pane === right.pane &&
    left.terminal === right.terminal &&
    left.cwd === right.cwd &&
    left.script === right.script
  );
}

function createToken(): string {
  return `popup-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 14)}`;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
