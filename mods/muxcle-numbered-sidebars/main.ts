import { View, div, type AsyncContext, type Context, type NativeElement, type Props } from "gpui-kit";
import { h_flex, v_flex } from "gpui-base";
import { agents, panes, props, run, spaces, theme } from "herdr";
import {
  agentRows,
  agentSelection,
  roleFor,
  spaceRows,
  spaceSelection,
  statusColor,
  type NumberedAgentRow,
  type NumberedSpaceRow,
  type SidebarRole,
} from "./model.js";

const ROW_HEIGHT = 26;
const NUMBER_ANIMATION = { from: 0.25, to: 1, period: 1600 } as const;

export default class MuxcleNumberedSidebars extends View {
  private role: SidebarRole | null = null;

  init(initialProps: Props | undefined, _cx: AsyncContext): void {
    this.role = roleFor(initialProps?.role) ?? roleFor(props()?.role);
  }

  render(_cx: Context): NativeElement {
    const palette = theme();
    const role = this.role ?? roleFor(props()?.role);
    if (!role) return this.invalidRole(palette.dim ?? palette.muted ?? palette.foreground ?? "");

    return role === "spaces" ? this.spacesView(palette) : this.agentsView(palette);
  }

  private spacesView(palette: Record<string, string>): NativeElement {
    const rows = spaceRows(spaces());
    if (rows.length === 0) return this.emptyView(palette);

    return v_flex()
      .id("numbered-spaces-list")
      .w_full()
      .h_full()
      .min_h(0)
      .overflow_y_scrollbar()
      .mode("always")
      .items_center()
      .gap(2)
      .children(rows.map((row) => this.spaceItem(row, palette)));
  }

  private agentsView(palette: Record<string, string>): NativeElement {
    const rows = agentRows(agents());
    if (rows.length === 0) return this.emptyView(palette);

    return v_flex()
      .id("numbered-agents-list")
      .w_full()
      .h_full()
      .min_h(0)
      .overflow_y_scrollbar()
      .mode("always")
      .items_center()
      .gap(2)
      .children(rows.map((row) => this.agentItem(row, palette)));
  }

  private spaceItem(row: NumberedSpaceRow, palette: Record<string, string>): NativeElement {
    let number = div()
      .text_size(12)
      .font_semibold()
      .text_color(statusColor(palette, row.status))
      .child(String(row.number));
    if (row.status === "working") number = number.loop("opacity", NUMBER_ANIMATION);

    return h_flex()
      .id(`numbered-spaces-${row.number}`)
      .w_full()
      .h(ROW_HEIGHT)
      .flex_none()
      .items_center()
      .justify_center()
      .gap(3)
      .hover((element: NativeElement) => element.bg(palette.hover ?? palette.raised ?? palette.background ?? ""))
      .cursor_pointer()
      .on_click(() => this.selectSpace(row.id))
      .child(this.selectedMarker(row.selected, palette))
      .child(number);
  }

  private agentItem(row: NumberedAgentRow, palette: Record<string, string>): NativeElement {
    let number = div()
      .text_size(12)
      .font_semibold()
      .text_color(statusColor(palette, row.status))
      .child(String(row.number));
    if (row.status === "working") number = number.loop("opacity", NUMBER_ANIMATION);

    const item = h_flex()
      .id(`numbered-agents-${row.number}`)
      .w_full()
      .h(ROW_HEIGHT)
      .flex_none()
      .items_center()
      .justify_center()
      .gap(3)
      .hover((element: NativeElement) => element.bg(palette.hover ?? palette.raised ?? palette.background ?? ""));

    if (row.pane) {
      item.cursor_pointer().on_click(() => this.focusAgent(row));
    }

    if (row.status === "unknown" || !row.pane) {
      item.child(
        div()
          .w(8)
          .text_size(10)
          .text_color(palette.dim ?? palette.muted ?? "")
          .child("?"),
      );
    }
    return item.child(number);
  }

  private selectedMarker(selected: boolean, palette: Record<string, string>): NativeElement {
    return div()
      .w(8)
      .text_size(11)
      .text_color(selected ? (palette.foreground ?? palette.dim ?? "") : (palette.dim ?? palette.muted ?? ""))
      .child(selected ? ">" : " ");
  }

  private emptyView(palette: Record<string, string>): NativeElement {
    return v_flex()
      .w_full()
      .h_full()
      .items_center()
      .justify_center()
      .child(
        div()
          .text_size(11)
          .text_color(palette.dim ?? palette.muted ?? "")
          .child("–"),
      );
  }

  private invalidRole(color: string): NativeElement {
    return v_flex()
      .w_full()
      .h_full()
      .items_center()
      .justify_center()
      .child(div().text_size(11).text_color(color).child("?"));
  }

  private selectSpace(id: string): void {
    const action = spaceSelection(id, spaces());
    if (action) run(action.command, action.args);
  }

  private focusAgent(target: NumberedAgentRow): void {
    const action = agentSelection(target, agents(), panes());
    if (action) run(action.command, action.args);
  }
}
