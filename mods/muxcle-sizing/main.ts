import { View, div, type AsyncContext, type Context, type NativeElement } from "gpui-kit";
import { h_flex, v_flex } from "gpui-base";
import {
  appHome,
  closeOverlay,
  exec,
  focused,
  nextCommand,
  notify,
  openOverlay,
  panes,
  props,
  spaces,
  theme,
} from "herdr";
import { executeDocumentEqualization } from "./adapter.js";
import { SizingController } from "./controller.js";
import { isSizingOperation } from "./model.js";

const MOD_NAME = "muxcle-sizing";

export default class MuxcleSizing extends View {
  private closed = false;
  private helpView = false;
  private helpFocus?: ReturnType<Context["focus_handle"]>;
  private controller?: SizingController;

  init(_viewProps: Record<string, unknown> | undefined, cx: AsyncContext): void {
    this.helpView = props()?.role === "help";
    if (this.helpView) {
      const focus = cx.focus_handle();
      this.helpFocus = focus;
      focus.focus();
      return;
    }

    const controller = new SizingController({
      snapshot: () => {
        const focus = focused();
        const space = spaces().find((item) => item.id === focus?.space);
        return {
          focus,
          tab: space?.tabs.find((item) => item.id === focus?.tab),
          panes: panes(),
          machine: space?.machine ?? null,
        };
      },
      document: (context, operation) =>
        executeDocumentEqualization(exec, `${appHome().replace(/[\\/]+$/, "")}/mods/${MOD_NAME}`, context, operation),
      notice: (message, level) => notify({ title: "Pane sizing", body: message, level }),
      openHelp: () =>
        openOverlay({
          mod: MOD_NAME,
          kind: "dialog",
          frame: "none",
          width: 640,
          props: { role: "help" },
        }),
    });
    this.controller = controller;

    cx.spawn(async (hostCx) => {
      while (!this.closed) {
        const command = await nextCommand();
        hostCx.notify();
        if (this.closed) return;
        if (command !== "help" && !isSizingOperation(command)) continue;
        hostCx.spawn(async (operationCx) => {
          await controller.execute(command);
          if (!this.closed) operationCx.notify();
        });
      }
    });
  }

  render(): NativeElement | string {
    return this.helpView ? this.renderHelp() : "";
  }

  close(): void {
    this.closed = true;
    this.controller?.dispose();
  }

  private renderHelp(): NativeElement {
    const focus = this.helpFocus;
    if (!focus) return div().child("Pane sizing help is unavailable.");

    const palette = theme();
    return v_flex()
      .w(640)
      .p(20)
      .gap(12)
      .rounded(12)
      .border_1()
      .border_color(palette.border)
      .bg(palette.background)
      .track_focus(focus)
      .on_key_down((event, cx) => {
        if (event.keystroke !== "escape") return;
        cx.stop_propagation();
        this.closeHelp();
      })
      .child(
        h_flex()
          .items_center()
          .justify_between()
          .child(div().font_semibold().text_size(16).text_color(palette.foreground).child("Pane sizing"))
          .child(
            div()
              .cursor_pointer()
              .text_color(palette.accent)
              .on_click(() => this.closeHelp())
              .child("Close ×"),
          ),
      )
      .child(
        div()
          .text_color(palette.foreground)
          .child(
            "Resize the focused branch in its nearest row or column split, or balance flexible sibling weights recursively.",
          ),
      )
      .child(div().font_semibold().text_color(palette.foreground).child("Commands · run with herdr-app do <command>"))
      .child(div().text_color(palette.foreground).child("muxcle-sizing.help — open this guide."))
      .child(
        div().text_color(palette.foreground).child("muxcle-sizing.equalize — recursively equalize flexible siblings."),
      )
      .child(
        div()
          .text_color(palette.foreground)
          .child("muxcle-sizing.grow-width — grow the focused branch at its nearest row split."),
      )
      .child(
        div()
          .text_color(palette.foreground)
          .child("muxcle-sizing.shrink-width — shrink the focused branch at its nearest row split."),
      )
      .child(
        div()
          .text_color(palette.foreground)
          .child("muxcle-sizing.grow-height — grow the focused branch at its nearest column split."),
      )
      .child(
        div()
          .text_color(palette.foreground)
          .child("muxcle-sizing.shrink-height — shrink the focused branch at its nearest column split."),
      )
      .child(
        div()
          .text_color(palette.dim)
          .child(
            "Grow multiplies only that branch's weight by 1.1; shrink divides by 1.1. This reciprocal step changes proportional weights, not a fixed percentage of screen area. For equal siblings, one grow step changes [1, 1] to [1.1, 1].",
          ),
      )
      .child(
        div()
          .text_color(palette.dim)
          .child(
            "Use ordinary, unzoomed terminal panes. Fixed or constrained sizing, mod/replaced panes, and unsupported layouts are refused. Equalize balances flexible groups, not pixel area across an uneven nested tree.",
          ),
      )
      .child(div().font_semibold().text_color(palette.foreground).child("Requirements"))
      .child(
        div()
          .text_color(palette.dim)
          .child(
            "Mount exactly one shown, non-focusable muxcle-sizing host block. Requires Herdr 0.1.13+, Python 3, and hc on Herdr's PATH with versioned doc.get/doc.set support.",
          ),
      );
  }

  private closeHelp(): void {
    const overlay = props()?.overlay;
    if (overlay) closeOverlay(overlay);
  }
}
