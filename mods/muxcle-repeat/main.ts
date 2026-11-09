import { View, div, type AsyncContext, type Context, type NativeElement } from "gpui-kit";
import { h_flex, v_flex } from "gpui-base";
import { closeOverlay, props, run, theme } from "herdr";
import { RepeatSession, REPEAT_TIMEOUT_MS, restoreRepeatFocus, type RepeatSchedule } from "./repeat.js";

const MOD_NAME = "muxcle-repeat";

export default class MuxcleRepeat extends View {
  private closed = false;
  private focus?: ReturnType<Context["focus_handle"]>;
  private session?: RepeatSession;

  init(_viewProps: Record<string, unknown> | undefined, cx: AsyncContext): void {
    this.focus = cx.focus_handle();
    this.session = new RepeatSession(() => this.dismiss());
    this.session.arm(this.schedule(cx));
    this.focus.focus();
  }

  render(): NativeElement {
    return this.renderRepeatView();
  }

  close(): void {
    if (this.closed) return;
    this.closed = true;
    this.session?.dispose();
  }

  private schedule(cx: Context): RepeatSchedule {
    return (milliseconds, callback) => {
      const timer = cx.timer.after(milliseconds, callback);
      return () => timer.cancel();
    };
  }

  private renderRepeatView(): NativeElement {
    const palette = theme();
    if (!this.focus) return div().child("Navigation repeat is unavailable.");

    return v_flex()
      .id(MOD_NAME)
      .w(580)
      .h(108)
      .p(14)
      .gap(8)
      .bg(palette.popover ?? palette.background)
      .rounded(12)
      .track_focus(this.focus)
      .on_key_down((event, eventCx) => {
        eventCx.stop_propagation();
        const action = this.session?.press(event.keystroke, this.schedule(eventCx));
        if (!action) return;

        try {
          run(action.command, "args" in action ? action.args : undefined);
        } catch {
          this.session?.finish();
          return;
        }

        eventCx.timer.after(0, () => {
          restoreRepeatFocus(this.session, () => this.focus?.focus());
        });
      })
      .child(
        h_flex()
          .justify_between()
          .child(div().text_color(palette.accent).font_semibold().child("Repeat navigation"))
          .child(
            div()
              .id("repeat-exit")
              .cursor_pointer()
              .text_color(palette.muted)
              .on_click(() => this.session?.finish())
              .child("Exit · Esc"),
          ),
      )
      .child(div().text_color(palette.foreground).child("n previous tab · p next tab · h/j/k/l or Ctrl-h/j/k/l panes"))
      .child(
        div()
          .text_size(11)
          .text_color(palette.dim)
          .child(`Exits after ${REPEAT_TIMEOUT_MS / 1000}s idle. Other keys exit; press again to type.`),
      );
  }

  private dismiss(): void {
    if (this.closed) return;
    this.closed = true;
    this.session?.dispose();
    const overlay = props()?.overlay;
    if (typeof overlay === "string") closeOverlay(overlay);
  }
}
