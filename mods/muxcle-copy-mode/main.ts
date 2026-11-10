import { h_flex, v_flex } from "gpui-base";
import { View, div, type AsyncContext, type Context, type NativeElement } from "gpui-kit";
import {
  agents,
  appHome,
  closeOverlay,
  focused,
  hc,
  home,
  layout,
  notify,
  openOverlay,
  props,
  setShared,
  shared,
  spaces,
  theme,
  type OverlaySpec,
} from "herdr";
import {
  COPY_MODE_ACTIVE_KEY,
  copyModeKeyAction,
  copyModePlan,
  copyModeTarget,
  launchCopyMode,
  readCoreId,
  readMachineId,
  sameCopyModeTarget,
  type CopyModeActiveRecord,
  type CopyModePlan,
  type CopyModeTarget,
} from "./copy-mode.js";

const MOD_NAME = "muxcle-copy-mode";

export default class MuxcleCopyMode extends View {
  private launcherOverlay: string | null = null;
  private focus!: ReturnType<Context["focus_handle"]>;
  private status = "No capture occurs until you choose Copy snapshot.";
  private targetError: string | null = null;
  private starting = false;
  private dismissed = false;
  private cancelled = false;
  private transferred = false;

  init(viewProps: Record<string, unknown> | null | undefined, cx: AsyncContext): void {
    this.focus = cx.focus_handle();
    this.focus.focus();
    const values = viewProps ?? props() ?? {};
    this.launcherOverlay = typeof values.overlay === "string" ? values.overlay : null;
  }

  render(): NativeElement {
    const palette = theme();
    const target = this.currentTarget();
    const targetText = target
      ? `Displayed terminal: ${target.terminal}`
      : (this.targetError ?? "Focus a visible terminal or agent body first.");

    return v_flex()
      .id(MOD_NAME)
      .w(520)
      .h(220)
      .p(16)
      .gap(12)
      .bg(palette.popover ?? palette.background)
      .text_color(palette.foreground)
      .border_1()
      .border_color(palette.border ?? palette.muted)
      .rounded(12)
      .track_focus(this.focus)
      .on_key_down((event, cx) => this.onKeyDown(event.keystroke, cx))
      .child(
        h_flex()
          .items_center()
          .justify_between()
          .child(div().text_size(16).font_semibold().child("Keyboard copy mode"))
          .child(this.action("Close · Esc", palette.muted, () => this.closeLauncher())),
      )
      .child(div().child("Captures Native's displayed terminal or visible focused-agent body as a read-only snapshot."))
      .child(
        div()
          .text_size(12)
          .text_color(palette.muted)
          .child("Nothing is read or launched until you choose Copy snapshot. Press Enter to capture · Esc to close."),
      )
      .child(
        div()
          .text_size(12)
          .text_color(palette.dim ?? palette.muted)
          .child(targetText),
      )
      .child(div().text_size(12).text_color(palette.muted).child(this.status))
      .child(this.action(this.starting ? "Capturing…" : "Copy snapshot", palette.accent, (cx) => this.start(cx)));
  }

  close(): void {
    this.dismissed = true;
    if (!this.transferred) this.cancelled = true;
  }

  private onKeyDown(keystroke: string, cx: Context): void {
    const action = copyModeKeyAction(keystroke);
    if (!action) return;

    cx.stop_propagation();
    if (action === "capture") this.start(cx);
    else this.closeLauncher();
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

  private currentTarget(): CopyModeTarget | null {
    try {
      const target = copyModeTarget(focused(), layout(), agents(), spaces());
      this.targetError = null;
      return target;
    } catch (error) {
      this.targetError = errorMessage(error);
      return null;
    }
  }

  private async currentPlan(): Promise<CopyModePlan | null> {
    const target = this.currentTarget();
    if (!target) return null;

    const coreId = await readCoreId(hc);
    const machineId = target.machine === null ? null : await readMachineId(hc, target.machine);
    const latestTarget = this.currentTarget();
    if (!latestTarget || !sameCopyModeTarget(target, latestTarget)) return null;

    return copyModePlan(target, appHome(), home(), coreId, machineId);
  }

  private start(cx: Context): void {
    if (this.starting || this.dismissed) return;

    this.starting = true;
    this.status = "Verifying the displayed terminal and Core identity…";
    this.cancelled = false;
    cx.notify();
    const token = createToken();

    // Only this explicit button starts Core queries or snapshot capture.
    cx.spawn(
      async (taskCx: AsyncContext) => {
        try {
          const result = await launchCopyMode(true, () => this.currentPlan(), this.createIO(), token);
          this.starting = false;
          if (!result) {
            if (!this.dismissed) {
              this.status = "The viewer exited before it could open.";
              taskCx.notify();
            }
            return;
          }

          this.transferred = true;
          if (result.kind === "left-running") {
            this.status = `Viewer left running: ${result.evidence} Inspect with: hc get ${result.session.address}`;
            notify({ title: "Copy mode viewer left running", body: this.status, level: "warning" });
            if (!this.dismissed) taskCx.notify();
            return;
          }

          this.status =
            result.kind === "opened-existing"
              ? `Reopened the existing viewer ${result.session.address}; no new snapshot was captured.`
              : `Snapshot opened in ${result.session.address}. Press q or Esc to leave the viewer.`;
          if (this.launcherOverlay) closeOverlay(this.launcherOverlay);
          if (!this.dismissed) taskCx.notify();
        } catch (error) {
          this.starting = false;
          this.status = errorMessage(error);
          notify({ title: "Copy mode could not start", body: this.status, level: "error" });
          if (!this.dismissed) taskCx.notify();
        }
      },
      { owner: null },
    );
  }

  private createIO() {
    return {
      active: () => shared(COPY_MODE_ACTIVE_KEY),
      claimActive: (record: CopyModeActiveRecord) => claimActive(record),
      setActive: (record: CopyModeActiveRecord) => setActive(record),
      clearActive: (token: string) => clearActive(token),
      core: (args: string[]) => hc(args),
      open: (spec: Record<string, unknown>) => openOverlay(spec as OverlaySpec),
      cancelled: () => this.cancelled,
    };
  }

  private closeLauncher(): void {
    this.dismissed = true;
    if (!this.transferred) this.cancelled = true;
    if (this.launcherOverlay) closeOverlay(this.launcherOverlay);
  }
}

function clearActive(token: string): void {
  const current = shared(COPY_MODE_ACTIVE_KEY);
  if (isRecord(current) && current.token === token) setShared(COPY_MODE_ACTIVE_KEY, null);
}

function claimActive(record: CopyModeActiveRecord): boolean {
  const current = shared(COPY_MODE_ACTIVE_KEY);
  if (current !== null && current !== undefined) return false;
  setShared(COPY_MODE_ACTIVE_KEY, record);
  return true;
}

function setActive(record: CopyModeActiveRecord): boolean {
  const current = shared(COPY_MODE_ACTIVE_KEY);
  if (!isRecord(current) || current.schema !== 1 || current.token !== record.token) return false;
  setShared(COPY_MODE_ACTIVE_KEY, record);
  return true;
}

function createToken(): string {
  return `copy-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 14)}`;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
