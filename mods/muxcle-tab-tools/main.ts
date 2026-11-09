import { View, div, type AsyncContext, type Context, type NativeElement } from "gpui-kit";
import { h_flex, v_flex, Input, InputState } from "gpui-base";
import { closeOverlay, focused, nextCommand, notify, openOverlay, props, run, spaces, theme } from "herdr";
import { MovePositionController, TabToolsController } from "./controller.js";
import { positionMaximum, type MoveTarget } from "./model.js";

const MOD_NAME = "muxcle-tab-tools";

type PositionProps = { role: "position"; target: MoveTarget };

export default class MuxcleTabTools extends View {
  private closed = false;
  private positionView = false;
  private focus?: ReturnType<Context["focus_handle"]>;
  private input?: InputState;
  private message = "";
  private target: MoveTarget | null = null;
  private positionController?: MovePositionController;

  init(_viewProps: Record<string, unknown> | undefined, cx: AsyncContext): void {
    const viewProps = props();
    if (viewProps?.role === "position") {
      this.initPosition(viewProps, cx);
      return;
    }

    const controller = new TabToolsController({
      spaces,
      focused,
      run: (action) => run(action.command, action.args),
      openPosition: (target) =>
        openOverlay({
          mod: MOD_NAME,
          kind: "dialog",
          frame: "none",
          width: 440,
          props: { role: "position", target },
        }),
      notify: (body, level) => notify({ title: "Tab tools", body, level }),
    });
    cx.spawn(async (hostCx) => {
      while (!this.closed) {
        const command = await nextCommand();
        hostCx.notify();
        if (this.closed) return;
        controller.handle(command);
      }
    });
  }

  render(): NativeElement | string {
    return this.positionView ? this.renderPosition() : "";
  }

  close(): void {
    this.closed = true;
    this.positionController?.dispose();
  }

  private initPosition(viewProps: unknown, cx: AsyncContext): void {
    this.positionView = true;
    this.focus = cx.focus_handle();
    this.target = isPositionProps(viewProps) ? viewProps.target : null;
    this.message = this.target ? "" : "The original tab could not be identified. Close this prompt and try again.";
    this.input = InputState.new({ placeholder: "0" });
    if (this.target) {
      this.positionController = new MovePositionController(this.target, {
        spaces,
        run: (action) => run(action.command, action.args),
        close: () => this.closePositionOverlay(),
      });
    }
    this.input.on("submit", (_event, eventCx) => {
      const result = this.positionController?.submit(this.input!.value());
      if (!result) return;
      if (result.kind === "refused") {
        this.message = result.message;
        eventCx.notify();
      } else if (result.kind !== "closed") {
        this.message = "";
      }
    });
    if (this.target && positionMaximum(spaces(), this.target) !== null) this.input.focus();
    else this.focus?.focus();
  }

  private renderPosition(): NativeElement {
    const palette = theme();
    const maximum = this.target ? positionMaximum(spaces(), this.target) : null;
    const hint =
      maximum === null
        ? "The original tab is no longer available."
        : `Choose a zero-based position from 0 to ${maximum}.`;

    const surface = v_flex()
      .w(440)
      .p(16)
      .gap(12)
      .rounded(12)
      .border_1()
      .border_color(palette.border)
      .bg(palette.background);
    if (this.focus) surface.track_focus(this.focus);
    surface
      .on_key_down((event, eventCx) => {
        if (event.keystroke !== "escape") return;
        eventCx.stop_propagation();
        this.dismissPosition();
      })
      .child(
        h_flex()
          .items_center()
          .justify_between()
          .child(div().font_semibold().text_color(palette.foreground).child("Move tab to position"))
          .child(
            div()
              .cursor_pointer()
              .text_color(palette.accent)
              .on_click(() => this.dismissPosition())
              .child("Cancel ×"),
          ),
      )
      .child(div().text_color(palette.dim).child(hint));

    if (this.input && this.target && maximum !== null) {
      surface.child(Input.new(this.input).h(36).text_color(palette.foreground));
    }
    const message =
      this.message || (maximum === null ? "No move will be sent." : "Press Enter to move · Esc to cancel");
    surface.child(
      div()
        .text_color(this.message ? palette.foreground : palette.dim)
        .child(message),
    );
    return surface;
  }

  private dismissPosition(): void {
    if (this.positionController) {
      this.positionController.cancel();
      return;
    }
    this.closePositionOverlay();
  }

  private closePositionOverlay(): void {
    if (this.closed) return;
    this.closed = true;
    const overlay = props()?.overlay;
    if (typeof overlay === "string") closeOverlay(overlay);
  }
}

function isPositionProps(value: unknown): value is PositionProps {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return false;
  const record = value as Record<string, unknown>;
  if (
    record.role !== "position" ||
    !record.target ||
    typeof record.target !== "object" ||
    Array.isArray(record.target)
  ) {
    return false;
  }
  const target = record.target as Record<string, unknown>;
  return (
    typeof target.spaceId === "string" &&
    target.spaceId.length > 0 &&
    typeof target.tabId === "string" &&
    target.tabId.length > 0
  );
}
