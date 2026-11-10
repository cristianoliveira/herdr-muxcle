import { h_flex, v_flex, Input, InputState, v_virtual_list, VirtualListScrollHandle } from "gpui-base";
import { View, div, type AsyncContext, type Context, type NativeElement } from "gpui-kit";
import { appHome, closeOverlay, exec, focused, layout, panes, props, spaces, theme } from "herdr";
import { createPortProcessPickerAdapter } from "./adapter.js";
import { PortProcessPickerController } from "./controller.js";
import { filterProcesses, type ProcessEvidence, type SignalKind } from "./model.js";

const MOD_NAME = "muxcle-port-process-picker";
const MAX_QUERY_CHARS = 256;

export default class MuxclePortProcessPicker extends View {
  private controller!: PortProcessPickerController;
  private focus!: ReturnType<Context["focus_handle"]>;
  private input!: InputState;
  private scroll!: VirtualListScrollHandle;
  private overlayId = "";
  private query = "";
  private message = "";
  private hasScanned = false;
  private closed = false;

  init(viewProps: Record<string, unknown> | null | undefined, cx: AsyncContext): void {
    const values = viewProps ?? props() ?? {};
    this.overlayId = typeof values.overlay === "string" ? values.overlay : "";
    this.focus = cx.focus_handle();
    this.scroll = VirtualListScrollHandle.new();
    this.controller = new PortProcessPickerController(
      createPortProcessPickerAdapter({
        appHome,
        focused,
        spaces,
        panes,
        layout,
        exec: (command, args, options) => exec(command, args, options),
      }),
    );
    this.input = InputState.new({ placeholder: "Search PID, command, start time, or port…" });
    this.input.on("change", (_event, eventCx) => {
      if (this.controller.model.phase !== "selecting") return;
      this.query = this.input.value().slice(0, MAX_QUERY_CHARS);
      this.scroll.scroll_to_item(0);
      eventCx.notify();
    });
    this.input.on("submit", (_event, eventCx) => eventCx.stop_propagation());
    this.input.focus();
  }

  render(cx: Context): NativeElement {
    const palette = theme();
    const phase = this.controller.model.phase;
    const selecting = phase === "selecting";
    const reviewing =
      phase === "reviewing" || phase === "force-reviewing" || phase === "signaling" || phase === "complete";
    const forceReview = phase === "force-reviewing";
    const snapshot = this.controller.model.reviewSnapshot;
    const candidates = selecting ? filterProcesses(this.controller.model.processes, this.query) : [...(snapshot ?? [])];
    const selectedCount = this.controller.model.selectedPids.size;
    const busy = this.controller.busy;

    const panel = v_flex()
      .id(MOD_NAME)
      .w(780)
      .max_h(760)
      .p(16)
      .gap(10)
      .rounded(12)
      .border_1()
      .border_color(palette.border)
      .bg(palette.background)
      .track_focus(this.focus)
      .on_key_down((event, eventCx) => {
        const action = this.controller.model.keyAction(event.key);
        if (action === "cancel") {
          eventCx.stop_propagation();
          this.dismiss();
        } else if (action === "ignore") {
          eventCx.stop_propagation();
        }
      })
      .child(
        h_flex()
          .justify_between()
          .child(
            div()
              .font_semibold()
              .text_color(forceReview ? (palette.error ?? palette.ansi1) : palette.foreground)
              .child(title(phase, candidates.length)),
          )
          .child(
            this.button(
              "port-picker-close",
              phase === "complete" ? "Done ×" : "Cancel ×",
              () => this.dismiss(),
              palette,
              false,
              phase === "signaling",
            ),
          ),
      );

    if (selecting) {
      panel.child(
        div()
          .text_color(palette.muted)
          .child("Only the active local terminal context is accepted. Nothing is scanned until you choose Scan."),
      );
      if (this.controller.model.processes.length > 0) {
        panel.child(Input.new(this.input).h(36).px(10).rounded(6).bg(palette.hover));
      }
    }

    if (selecting && busy) {
      panel.child(div().text_color(palette.muted).child("Inspecting local TCP listeners…"));
    }

    if (reviewing) {
      panel.child(
        div()
          .text_color(palette.warning ?? palette.accent)
          .child(
            forceReview
              ? "Force KILL is irreversible and bypasses process cleanup. This separate confirmation applies only to the frozen processes shown below."
              : "This exact process set is frozen. TERM requests graceful shutdown; a process may remain alive. No automatic KILL or retry will follow.",
          ),
      );
      panel.child(
        div()
          .text_size(12)
          .text_color(palette.muted)
          .child(
            "Identity and listening ports are rechecked immediately before each signal. PID reuse and OS scheduling still leave a small race; permissions can deny a signal, and outcomes can be partial.",
          ),
      );
    }

    if (candidates.length > 0) {
      const rowKeys = candidates.map((process) => String(process.pid));
      const itemSizes = candidates.map(() => 68);
      panel.child(
        v_virtual_list(
          "muxcle-port-process-picker-processes",
          candidates.length,
          itemSizes,
          (index) => rowKeys[index],
          (range) =>
            candidates
              .slice(range.start, range.end)
              .map((process) => this.renderProcessRow(process, selecting, palette)),
        )
          .h(380)
          .track_scroll(this.scroll)
          .on_item_click((key, eventCx) => {
            if (!selecting || busy) return;
            const pid = Number(key);
            if (this.controller.toggle(pid)) eventCx.notify();
          }),
      );
    } else {
      panel.child(
        div()
          .h(72)
          .text_color(palette.dim)
          .child(
            selecting
              ? this.hasScanned
                ? "No local TCP listeners found."
                : "No inventory yet. Scan to inspect local TCP listeners."
              : "No processes were captured for review.",
          ),
      );
    }

    if (selecting) {
      panel.child(
        div().text_color(palette.dim).child(`${selectedCount} selected · ${candidates.length} shown · max 32`),
      );
      panel.child(
        div()
          .text_size(12)
          .text_color(palette.muted)
          .child("Each process is signaled at most once even when it listens on several ports."),
      );
    }
    for (const warning of this.controller.model.warnings) {
      panel.child(
        div()
          .text_size(11)
          .text_color(palette.warning ?? palette.accent)
          .child(warning),
      );
    }
    if (this.message) panel.child(div().text_color(palette.foreground).child(this.message));

    panel.child(this.renderActions(phase, selectedCount, palette, cx));
    return panel;
  }

  close(): void {
    this.closed = true;
    this.controller?.dispose();
    this.input?.release();
    this.scroll?.release();
  }

  private renderProcessRow(
    process: ProcessEvidence,
    selecting: boolean,
    palette: Record<string, string>,
  ): NativeElement {
    const selected = this.controller.model.selectedPids.has(process.pid);
    return v_flex()
      .h(68)
      .px(8)
      .py(5)
      .gap(3)
      .rounded(6)
      .bg(selecting && selected ? palette.hover : palette.background)
      .child(
        h_flex()
          .gap(8)
          .items_center()
          .child(
            div()
              .w(38)
              .text_color(selected ? palette.accent : palette.dim)
              .child(selecting ? (selected ? "[x]" : "[ ]") : "•"),
          )
          .child(div().w(84).text_color(palette.foreground).child(`PID ${process.pid}`))
          .child(div().flex_1().text_color(palette.foreground).child(display(process.command)))
          .child(div().text_size(11).text_color(palette.muted).child(`UID ${process.uid}`)),
      )
      .child(
        div()
          .text_size(11)
          .text_color(palette.dim)
          .child(`TCP ${process.ports.join(", ")} · started ${display(process.startedAt)}`),
      );
  }

  private renderActions(
    phase: string,
    selectedCount: number,
    palette: Record<string, string>,
    cx: Context,
  ): NativeElement {
    const busy = this.controller.busy;
    if (phase === "selecting") {
      return h_flex()
        .gap(8)
        .items_center()
        .justify_between()
        .child(
          this.button(
            "port-picker-scan",
            this.hasScanned ? "Rescan · clears selection" : "Scan local TCP listeners",
            () => this.startScan(cx),
            palette,
            false,
            busy,
          ),
        )
        .child(
          this.button(
            "port-picker-review",
            `Review ${selectedCount} selected`,
            () => this.startReview(cx),
            palette,
            false,
            busy || selectedCount === 0,
          ),
        );
    }
    if (phase === "reviewing") {
      return h_flex()
        .gap(8)
        .justify_between()
        .child(this.button("port-picker-back", "Back", () => this.back(cx), palette, false, busy))
        .child(
          h_flex()
            .gap(8)
            .child(
              this.button(
                "port-picker-force-review",
                "Review force KILL…",
                () => this.forceReview(cx),
                palette,
                true,
                busy,
              ),
            )
            .child(
              this.button(
                "port-picker-term",
                `Send TERM to ${this.controller.model.reviewSnapshot?.length ?? 0}`,
                () => this.startSignal("TERM", cx),
                palette,
                true,
                busy,
              ),
            ),
        );
    }
    if (phase === "force-reviewing") {
      return h_flex()
        .gap(8)
        .justify_between()
        .child(this.button("port-picker-back", "Back", () => this.back(cx), palette, false, busy))
        .child(
          this.button(
            "port-picker-kill-confirm",
            `Confirm force KILL ${this.controller.model.reviewSnapshot?.length ?? 0}`,
            () => this.startSignal("KILL", cx),
            palette,
            true,
            busy,
          ),
        );
    }
    if (phase === "signaling") {
      return div()
        .text_color(palette.warning ?? palette.accent)
        .child(
          "Sending one reviewed signal per process. Keep this dialog open for the result; no retry will be automatic.",
        );
    }
    return h_flex().child(this.button("port-picker-done", "Done", () => this.dismiss(), palette));
  }

  private button(
    id: string,
    label: string,
    action: () => void,
    palette: Record<string, string>,
    danger = false,
    disabled = false,
  ): NativeElement {
    const button = div()
      .id(id)
      .px(12)
      .py(8)
      .rounded(5)
      .text_color(disabled ? palette.dim : danger ? "#ffffff" : palette.foreground)
      .bg(disabled ? palette.background : danger ? palette.ansi1 : palette.hover)
      .child(label);
    return disabled
      ? button
      : button.cursor_pointer().on_click((_event, eventCx) => {
          eventCx.stop_propagation();
          action();
        });
  }

  private startScan(cx: Context): void {
    const pending = this.controller.scan();
    this.hasScanned = false;
    this.message = "";
    cx.notify();
    cx.spawn(async (asyncCx: AsyncContext) => {
      const result = await pending;
      if (this.closed) return;
      if (result.kind === "ready") {
        this.hasScanned = true;
        this.message =
          result.warnings > 0
            ? `Inventory completed with ${result.warnings} process-change warning(s); omitted processes cannot be selected.`
            : `Captured ${result.count} local listener process(es). Nothing has been signaled.`;
      } else if (result.kind === "unavailable") {
        this.message = result.message;
      }
      asyncCx.notify();
    });
  }

  private startReview(cx: Context): void {
    if (!this.controller.review()) return;
    this.message = "";
    cx.notify();
  }

  private forceReview(cx: Context): void {
    if (!this.controller.forceReview()) return;
    this.message =
      "Review the frozen process identities again. KILL is not sent until you press the separate confirmation button.";
    cx.notify();
  }

  private back(cx: Context): void {
    if (!this.controller.back()) return;
    this.message = "The previous review was cleared. Selection remains unchanged; review again before signaling.";
    this.input.focus();
    this.scroll.scroll_to_item(0);
    cx.notify();
  }

  private startSignal(signal: SignalKind, cx: Context): void {
    const pending = this.controller.signal(signal);
    this.message = signal === "TERM" ? "Sending graceful TERM…" : "Sending force KILL…";
    cx.notify();
    cx.spawn(async (asyncCx: AsyncContext) => {
      const result = await pending;
      if (this.closed) return;
      if (result.kind === "completed") this.message = signalMessage(result.outcome.signal, result.outcome.results);
      else if (result.kind === "changed" || result.kind === "unknown") this.message = result.message;
      asyncCx.notify();
    });
  }

  private dismiss(): void {
    if (this.closed || this.controller.model.phase === "signaling") return;
    this.controller.cancel();
    this.closed = true;
    if (this.overlayId) closeOverlay(this.overlayId);
  }
}

function title(phase: string, count: number): string {
  if (phase === "reviewing") return `Review ${count} exact listener process(es)`;
  if (phase === "force-reviewing") return `Review force KILL for ${count} process(es)`;
  if (phase === "signaling") return "Signal request in progress";
  if (phase === "complete") return "Signal result · no automatic retry";
  return "Local TCP listener processes";
}

function display(value: string): string {
  return value.replace(/[\u0000-\u001f\u007f]/gu, " ");
}

function signalMessage(signal: SignalKind, results: readonly { status: string }[]): string {
  const sent = results.filter(({ status }) => status === "sent").length;
  const stale = results.filter(({ status }) => status === "stale").length;
  const gone = results.filter(({ status }) => status === "gone").length;
  const denied = results.filter(({ status }) => status === "denied").length;
  const failed = results.filter(({ status }) => status === "failed").length;
  return `${signal} accepted for ${sent} process(es); ${stale} changed, ${gone} gone, ${denied} denied, ${failed} failed. Signal acceptance does not confirm exit. Rescan before any further action; no retry or escalation was sent.`;
}
