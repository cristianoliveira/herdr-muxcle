import { View, div, type AsyncContext, type Context, type NativeElement } from "gpui-kit";
import { h_flex, v_flex, Input, InputState, v_virtual_list, VirtualListScrollHandle } from "gpui-base";
import { closeOverlay, hc, machines, props, run, spaces, theme } from "herdr";
import { createSpaceCloserAdapter } from "./adapter.js";
import { SpaceCloserController } from "./controller.js";
import { closerKeyAction, filterSpaces, type ReviewedSpace, type SpaceInfo } from "./model.js";

const MOD_NAME = "muxcle-space-closer";
const MAX_QUERY_CHARS = 256;

export default class MuxcleSpaceCloser extends View {
  private controller!: SpaceCloserController;
  private focus!: ReturnType<Context["focus_handle"]>;
  private input!: InputState;
  private scroll!: VirtualListScrollHandle;
  private overlayId = "";
  private query = "";
  private message = "";
  private closed = false;

  init(_props: Record<string, unknown> | undefined, cx: AsyncContext): void {
    this.focus = cx.focus_handle();
    this.scroll = VirtualListScrollHandle.new();
    const overlay = props()?.overlay;
    this.overlayId = typeof overlay === "string" ? overlay : "";
    this.controller = new SpaceCloserController(
      createSpaceCloserAdapter({
        spaces: readSpaces,
        machines,
        hc,
        run: (name, args) => run(name, args),
      }),
    );
    this.input = InputState.new({ placeholder: "Filter spaces by name, machine or folder…" });
    this.input.on("change", (_event, eventCx) => {
      if (this.controller.phase !== "selecting") return;
      this.query = this.input.value().slice(0, MAX_QUERY_CHARS);
      this.scroll.scroll_to_item(0);
      eventCx.notify();
    });
    this.input.on("submit", (_event, eventCx) => {
      if (this.controller.phase !== "selecting") {
        eventCx.stop_propagation();
        return;
      }
      this.startReview(eventCx);
    });
    this.input.focus();
  }

  render(cx: Context): NativeElement {
    const palette = theme();
    const phase = this.controller.phase;
    const selecting = phase === "selecting" || phase === "checking-review";
    const reviewing = phase === "reviewing" || phase === "checking-confirm" || phase === "submitted";
    const review = this.controller.reviewSnapshot;
    const rows = selecting ? filterSpaces(this.controller.spaces(), this.query) : [...(review ?? [])];
    const selectedCount = this.controller.selectedIds.size;
    const panel = v_flex()
      .w(760)
      .max_h(740)
      .p(16)
      .gap(10)
      .rounded(12)
      .border_1()
      .border_color(palette.border)
      .bg(palette.background)
      .track_focus(this.focus)
      .on_key_down((event, eventCx) => {
        const action = closerKeyAction(phase, event.key, event.keystroke);
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
              .text_color(phase === "submitted" ? palette.foreground : palette.ansi1)
              .child(
                phase === "submitted"
                  ? "Close requests sent"
                  : reviewing
                    ? `Review ${rows.length} spaces before closing`
                    : "Select spaces to close",
              ),
          )
          .child(
            div()
              .cursor_pointer()
              .text_color(palette.accent)
              .on_click((_event, eventCx) => {
                eventCx.stop_propagation();
                this.dismiss();
              })
              .child("Cancel ×"),
          ),
      );

    if (selecting) {
      if (phase === "selecting") panel.child(Input.new(this.input).h(36).px(10).rounded(6).bg(palette.hover));
      else panel.child(div().text_color(palette.dim).child("Preparing the immutable review…"));
    }

    if (reviewing) {
      panel.child(
        div()
          .text_color(palette.ansi1)
          .child(
            "Closing a space ends its terminals and may terminate their agent trees, including remote terminals. This cannot be undone.",
          ),
      );
      panel.child(
        div()
          .text_color(palette.muted)
          .child("The review is frozen. Enter and Escape cannot confirm; use the explicit button below."),
      );
    } else {
      panel.child(
        div().text_color(palette.dim).child("Nothing is selected by default. Filtering keeps hidden selections."),
      );
    }

    if (rows.length > 0) {
      const rowKeys = rows.map((space, index) => `${index}:${space.id}`);
      const itemSizes = rows.map((space) =>
        reviewing ? 100 + Math.max(1, (space as ReviewedSpace).tabs.length) * 18 : 48,
      );
      panel.child(
        v_virtual_list(
          "muxcle-space-closer-rows",
          rows.length,
          itemSizes,
          (index) => rowKeys[index],
          (range) =>
            rows
              .slice(range.start, range.end)
              .map((space) =>
                reviewing
                  ? this.renderReviewRow(space as ReviewedSpace, palette)
                  : this.renderSelectionRow(space as SpaceInfo, palette),
              ),
        )
          .h(360)
          .track_scroll(this.scroll)
          .on_item_click((key, eventCx) => {
            if (this.controller.phase !== "selecting") return;
            const separator = key.indexOf(":");
            const index = Number(key.slice(0, separator));
            const id = rows[index]?.id;
            if (id && this.controller.toggle(id)) eventCx.notify();
          }),
      );
    } else {
      panel.child(
        div()
          .h(80)
          .text_color(palette.dim)
          .child(selecting ? "No matching spaces." : "No spaces were captured for review."),
      );
    }

    if (!reviewing) {
      panel.child(div().text_color(palette.dim).child(`${selectedCount} selected · ${rows.length} shown`));
    }
    if (phase === "checking-confirm") {
      panel.child(div().text_color(palette.dim).child("Rechecking every reviewed space and Core identity…"));
    }
    if (this.message) panel.child(div().text_color(palette.foreground).child(this.message));

    panel.child(
      h_flex()
        .gap(8)
        .items_center()
        .justify_between()
        .child(
          this.button("space-closer-cancel", phase === "submitted" ? "Done" : "Cancel", () => this.dismiss(), palette),
        )
        .child(
          reviewing && phase !== "submitted"
            ? h_flex()
                .gap(8)
                .child(this.button("space-closer-back", "Back", (eventCx) => this.back(eventCx), palette))
                .child(
                  this.button(
                    "space-closer-confirm",
                    phase === "checking-confirm" ? "Rechecking…" : `Confirm close ${rows.length} spaces`,
                    (eventCx) => this.startConfirm(eventCx),
                    palette,
                    true,
                    phase === "checking-confirm",
                  ),
                )
            : selecting
              ? this.button(
                  "space-closer-review",
                  phase === "checking-review" ? "Preparing review…" : `Review ${selectedCount} selected`,
                  (eventCx) => this.startReview(eventCx),
                  palette,
                  false,
                  phase === "checking-review" || selectedCount === 0,
                )
              : div()
                  .text_color(palette.muted)
                  .child(phase === "submitted" ? "Completion unknown" : ""),
        ),
    );

    return panel;
  }

  close(): void {
    this.closed = true;
    this.controller?.dispose();
    this.input?.release();
    this.scroll?.release();
  }

  private renderSelectionRow(space: SpaceInfo, palette: Record<string, string>): NativeElement {
    const selected = this.controller.selectedIds.has(space.id);
    const row = h_flex()
      .h(48)
      .px(8)
      .gap(10)
      .items_center()
      .rounded(6)
      .bg(selected ? palette.hover : palette.background)
      .child(
        div()
          .text_color(selected ? palette.accent : palette.dim)
          .child(selected ? "[x]" : "[ ]"),
      )
      .child(div().flex_1().text_color(palette.foreground).child(display(space.name)))
      .child(
        div()
          .text_size(11)
          .text_color(palette.muted)
          .child(display(space.machine ?? "local")),
      )
      .child(
        div()
          .text_size(11)
          .text_color(palette.muted)
          .child(`${space.tabs.length} tabs · ${paneCount(space)} panes`),
      );
    return row;
  }

  private renderReviewRow(space: ReviewedSpace, palette: Record<string, string>): NativeElement {
    const peer = space.machine === null ? "local Core" : `${display(space.machine)} · Core ${display(space.peerId)}`;
    const row = v_flex()
      .px(8)
      .py(6)
      .gap(3)
      .rounded(6)
      .bg(palette.hover)
      .child(div().font_semibold().text_color(palette.foreground).child(display(space.name)))
      .child(
        div()
          .text_size(11)
          .text_color(palette.muted)
          .child(`Space ID: ${display(space.id)}`),
      )
      .child(div().text_size(11).text_color(palette.muted).child(`Machine: ${peer}`))
      .child(
        div()
          .text_size(11)
          .text_color(palette.muted)
          .child(`Folder: ${display(space.folder || "(machine home)")}`),
      )
      .child(
        div()
          .text_size(11)
          .text_color(palette.muted)
          .child(`${space.tabs.length} tabs · ${paneCount(space)} panes`),
      );
    return row.children(
      space.tabs.map((tab) =>
        div()
          .text_size(11)
          .text_color(palette.dim)
          .child(`Tab ${display(tab.id)} — ${display(tab.name)} · ${tab.panes} panes`),
      ),
    );
  }

  private button(
    id: string,
    label: string,
    action: (cx: Context) => void,
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
    return disabled ? button : button.cursor_pointer().on_click((_event, eventCx) => action(eventCx));
  }

  private startReview(cx: Context): void {
    if (this.controller.phase !== "selecting") return;
    const pending = this.controller.review();
    this.message = "";
    cx.notify();
    cx.spawn(async (asyncCx: AsyncContext) => {
      const result = await pending;
      if (this.closed) return;
      if (result.kind === "empty") this.message = "Select one or more spaces before reviewing.";
      else if (result.kind === "missing")
        this.message = "A selected space disappeared. Select the current spaces and review again. Nothing was closed.";
      else if (result.kind === "unavailable") this.message = result.message;
      else if (result.kind === "cancelled") return;
      else this.message = "";
      asyncCx.notify();
    });
  }

  private startConfirm(cx: Context): void {
    if (this.controller.phase !== "reviewing") return;
    const pending = this.controller.confirm();
    this.message = "";
    cx.notify();
    cx.spawn(async (asyncCx: AsyncContext) => {
      const result = await pending;
      if (this.closed) return;
      if (result.kind === "changed") {
        this.message =
          "A reviewed space, tab, or Core identity changed. Nothing was sent; inspect the current selection and review again.";
        this.input.focus();
        this.scroll.scroll_to_item(0);
      } else if (result.kind === "unavailable") {
        this.message = result.message;
      } else if (result.kind === "submitted") {
        this.message = submissionMessage(result.attempted, result.dispatchErrors);
      } else if (result.kind === "cancelled") {
        return;
      }
      asyncCx.notify();
    });
  }

  private back(cx: Context): void {
    if (!this.controller.back()) return;
    this.message = "";
    this.input.focus();
    this.scroll.scroll_to_item(0);
    cx.notify();
  }

  private dismiss(): void {
    if (this.closed) return;
    this.controller.cancel();
    this.closed = true;
    if (this.overlayId) closeOverlay(this.overlayId);
  }
}

function readSpaces(): SpaceInfo[] {
  return spaces().map(({ id, name, folder, machine, tabs }) => ({
    id,
    name,
    folder,
    machine,
    tabs: tabs.map(({ id: tabId, name: tabName, panes }) => ({ id: tabId, name: tabName, panes })),
  }));
}

function paneCount(space: Pick<SpaceInfo, "tabs">): number {
  return space.tabs.reduce((total, tab) => total + tab.panes, 0);
}

function display(value: string): string {
  return value.replace(/[\u0000-\u001f\u007f]/gu, " ");
}

function submissionMessage(attempted: number, dispatchErrors: number): string {
  const returned = attempted - dispatchErrors;
  return `Attempted ${attempted} close dispatch call(s) (${returned} returned without error; ${dispatchErrors} threw). Herdr does not confirm terminal termination here; local and remote processes may still be stopping or the result may be partial. Inspect current spaces before any manual retry. No retry or rollback was sent.`;
}
