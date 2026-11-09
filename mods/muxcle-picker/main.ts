import { View, div, type Context, type AsyncContext, type NativeElement } from "gpui-kit";
import { h_flex, v_flex, Input, InputState, v_virtual_list, VirtualListScrollHandle } from "gpui-base";
import { appHome, closeOverlay, layout, props, readTextFile, run, shared, spaces, theme } from "herdr";
import {
  hasVisibleHistoryBlock,
  parsePickerOrder,
  pickerRows,
  selectedRowKey,
  selectionAction,
  type PickerOrder,
  type PickerRow,
} from "./model.js";

const MOD_NAME = "muxcle-picker";
const RECENT_TABS_KEY = "muxcle-history.recent-tabs.v1";

export default class MuxclePicker extends View {
  private input!: InputState;
  private focus!: ReturnType<Context["focus_handle"]>;
  private scroll!: VirtualListScrollHandle;
  private selected: string | null = null;
  private query = "";
  private message = "";
  private closed = false;
  private order: PickerOrder = "native";

  init(_props: Record<string, unknown> | undefined, cx: AsyncContext): void {
    this.focus = cx.focus_handle();
    this.scroll = VirtualListScrollHandle.new();
    this.input = InputState.new({ placeholder: "Search spaces and tabs…" });
    this.input.on("change", (_event, eventCx) => {
      this.query = this.input.value().slice(0, 256);
      this.selected = this.rows()[0]?.key ?? null;
      this.message = "";
      this.scrollToSelection();
      eventCx.notify();
    });
    this.input.on("submit", (_event, eventCx) => {
      if (this.selected) this.choose(this.selected, eventCx);
    });
    this.input.focus();
    cx.spawn(async (taskCx) => {
      try {
        this.order = parsePickerOrder(await readTextFile(appHomePath("data", MOD_NAME, "config.json")));
      } catch {
        this.order = "native";
      }
      if (!this.closed) taskCx.notify();
    });
  }

  close(): void {
    this.closed = true;
  }

  render(_cx: Context): NativeElement {
    const palette = theme();
    const rows = this.rows();
    this.selected = selectedRowKey(rows, this.selected);
    const surface = v_flex()
      .w(600)
      .max_h(580)
      .p(14)
      .gap(10)
      .bg(palette.background)
      .rounded(12)
      .track_focus(this.focus)
      .on_key_down((event, cx) => {
        if (event.keystroke === "escape") {
          this.dismiss();
        } else if (event.keystroke === "down" || event.keystroke === "ctrl-j") {
          this.move(1);
        } else if (event.keystroke === "up" || event.keystroke === "ctrl-k") {
          this.move(-1);
        } else {
          return;
        }
        cx.stop_propagation();
        cx.notify();
      })
      .child(
        h_flex()
          .justify_between()
          .child(div().font_semibold().text_color(palette.foreground).child("Spaces and tabs"))
          .child(div().text_size(11).text_color(palette.dim).child("Esc to close")),
      )
      .child(Input.new(this.input).h(36).text_color(palette.foreground));

    if (rows.length === 0) {
      surface.child(
        div()
          .h(80)
          .text_color(palette.dim)
          .child(this.query ? "No matching spaces or tabs." : "No spaces are open."),
      );
    } else {
      surface.child(
        v_flex()
          .h(320)
          .child(
            v_virtual_list(
              "muxcle-picker-rows",
              rows.length,
              40,
              (index) => rows[index].key,
              (range) =>
                rows.slice(range.start, range.end).map((row) =>
                  h_flex()
                    .h(40)
                    .px(8)
                    .items_center()
                    .justify_between()
                    .rounded(6)
                    .bg(row.key === this.selected ? palette.hover : palette.background)
                    .child(div().text_size(13).text_color(palette.foreground).child(display(row.label)))
                    .child(
                      div()
                        .text_size(11)
                        .text_color(palette.dim)
                        .child(display(row.machine ?? "local")),
                    ),
                ),
            )
              .track_scroll(this.scroll)
              .on_item_click((key, cx) => this.choose(key, cx)),
          ),
      );
    }
    if (this.message) surface.child(div().text_color(palette.foreground).child(this.message));
    surface.child(
      div().text_size(11).text_color(palette.dim).child(`${rows.length} results · ↑/↓ or Ctrl-J/K · Enter to select`),
    );
    return surface;
  }

  private rows(): PickerRow[] {
    let historyBlockVisible = false;
    let recentState: unknown = null;
    if (this.order === "recent") {
      try {
        historyBlockVisible = hasVisibleHistoryBlock(layout());
        if (historyBlockVisible) recentState = shared(RECENT_TABS_KEY);
      } catch {
        historyBlockVisible = false;
        recentState = null;
      }
    }
    return pickerRows(spaces(), this.query, this.order, recentState, historyBlockVisible);
  }

  private move(delta: -1 | 1): void {
    const rows = this.rows();
    if (rows.length === 0) return;
    const current = rows.findIndex((row) => row.key === this.selected);
    const next = current < 0 ? 0 : Math.max(0, Math.min(rows.length - 1, current + delta));
    this.selected = rows[next].key;
    this.scrollToSelection();
  }

  private scrollToSelection(): void {
    const index = this.rows().findIndex((row) => row.key === this.selected);
    if (index >= 0) this.scroll.scroll_to_item(index, "center");
  }

  private choose(key: string, cx: Context): void {
    if (this.closed) return;
    const action = selectionAction(spaces(), this.query, key);
    if (!action) {
      this.message = "That item is no longer available. Select another result.";
      cx.notify();
      return;
    }
    try {
      run(action.command, action.args);
    } catch {
      this.message = "Could not select that item. Check Herdr and try again.";
      cx.notify();
      return;
    }
    this.dismiss();
  }

  private dismiss(): void {
    if (this.closed) return;
    this.closed = true;
    const overlay = props().overlay;
    if (overlay) closeOverlay(overlay);
  }
}

function appHomePath(...parts: string[]): string {
  const base = appHome();
  const separator = base.includes("\\") ? "\\" : "/";
  const trimmedBase = base.replace(/[\\/]+$/u, "");
  return [trimmedBase, ...parts].join(separator);
}

function display(value: string): string {
  return value.replace(/[\u0000-\u001f\u007f]/g, " ");
}
