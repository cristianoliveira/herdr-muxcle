import {
  View,
  div,
  image,
  svg,
  type AsyncContext,
  type Context,
  type NativeElement,
  type Props,
  type Task,
} from "gpui-kit";
import { h_flex } from "gpui-base";
import { home, panes, props, run, spaces, theme } from "herdr";
import {
  capturePaneTarget,
  formatLocalClock,
  paneAction,
  panePresentation,
  roleFor,
  type PaneAction,
  type PaneTarget,
  type WorkspaceChromeRole,
} from "./model.js";

function icon(
  program: { icon?: string | null; tint?: boolean } | undefined,
  size: number,
  color: string,
): NativeElement | null {
  if (!program?.icon) return null;
  return program.tint
    ? svg(program.icon).size(size).flex_none().text_color(color)
    : image(program.icon).w(size).h(size).flex_none();
}

export default class MuxcleWorkspaceChrome extends View {
  private role: WorkspaceChromeRole | null = null;
  private paneId: string | null = null;
  private hovered = false;
  private closed = false;
  private clockText = "";
  private clockTask: Task | null = null;

  init(initialProps: Props | undefined, cx: AsyncContext): void {
    const requestedRole = roleFor(initialProps?.role) ?? roleFor(props()?.role);
    this.role = requestedRole;
    this.paneId =
      typeof initialProps?.pane === "string"
        ? initialProps.pane
        : typeof props()?.pane === "string"
          ? (props()?.pane ?? null)
          : null;

    if (requestedRole === "status-clock") {
      this.clockText = formatLocalClock(this.now());
      this.clockTask = cx.timer.every(1000, (timerContext) => {
        if (this.closed) return;
        const next = formatLocalClock(this.now());
        if (next === this.clockText) return;
        this.clockText = next;
        timerContext.notify();
      });
    }
  }

  close(): void {
    this.closed = true;
    this.clockTask?.cancel();
    this.clockTask = null;
  }

  protected now(): Date {
    return new Date();
  }

  render(_cx: Context): NativeElement {
    const palette = theme();
    if (this.role === "pane-footer") return this.paneFooter(palette);
    if (this.role === "status-clock") return this.statusClock(palette);
    return div()
      .text_size(11)
      .text_color(palette.dim ?? palette.muted ?? "")
      .child("?");
  }

  private paneFooter(palette: Record<string, string>): NativeElement {
    const snapshot = panes();
    const pane = snapshot.find((candidate) => candidate.pane === this.paneId);
    const target = capturePaneTarget(pane);
    if (!pane || !target) return div();

    const owner = spaces().find((space) => space.tabs.some((tab) => tab.id === pane.tab));
    const presentation = panePresentation(pane, owner, home());
    const pic = icon(presentation.program, 14, palette.dim ?? palette.muted ?? "");
    const root = h_flex()
      .id(`workspace-chrome-pane-${pane.pane}`)
      .size_full()
      .px(10)
      .gap(8)
      .items_center()
      .bg(palette.background)
      .border_t(1)
      .border_color(palette.border)
      .text_size(12)
      .on_hover((hovered, context) => {
        if (this.closed) return;
        this.hovered = hovered;
        context.notify();
      })
      .on_click(() => {
        if (this.closed) return;
        this.dispatchPane("focus", target);
      });

    if (pic) root.child(pic);
    root.child(
      div()
        .id(`workspace-chrome-title-${pane.pane}`)
        .max_w(160)
        .min_w(0)
        .truncate()
        .font_medium()
        .text_color(palette.foreground)
        .child(presentation.title),
    );
    root.child(
      div()
        .id(`workspace-chrome-folder-${pane.pane}`)
        .flex_1()
        .min_w(0)
        .truncate()
        .text_color(palette.dim ?? palette.muted ?? "")
        .child(presentation.folder),
    );

    if (presentation.branch) {
      root.child(
        h_flex()
          .id(`workspace-chrome-branch-${pane.pane}`)
          .max_w(160)
          .min_w(0)
          .gap(4)
          .items_center()
          .text_color(palette.dim ?? palette.muted ?? "")
          .child(svg("mods/workspace-chrome/branch.svg").size(13).flex_none())
          .child(div().id(`workspace-chrome-branch-label-${pane.pane}`).min_w(0).truncate().child(presentation.branch)),
      );
    }

    if (presentation.status === "working") {
      root.child(svg("mods/workspace-chrome/spinner.svg").size(12).flex_none().text_color(palette.working).spin(900));
    } else if (presentation.status === "blocked") {
      root.child(
        div()
          .flex_none()
          .px(6)
          .h(18)
          .rounded(5)
          .bg(`${palette.blocked}26`)
          .text_size(10.5)
          .font_semibold()
          .text_color(palette.blocked)
          .child("Needs you"),
      );
    } else if (presentation.status === "done") {
      root.child(div().size(7).flex_none().rounded(4).bg(palette.done));
    }

    if (this.hovered) {
      root.child(this.paneButton(palette, `ph-r-${pane.pane}`, "split-right", "split-right", target));
      root.child(this.paneButton(palette, `ph-d-${pane.pane}`, "split-down", "split-down", target));
      root.child(this.paneButton(palette, `ph-z-${pane.pane}`, pane.zoomed ? "unzoom" : "zoom", "zoom", target));
      root.child(this.paneButton(palette, `ph-x-${pane.pane}`, "close", "close", target));
    }

    return root;
  }

  private paneButton(
    palette: Record<string, string>,
    id: string,
    iconName: string,
    action: PaneAction,
    target: PaneTarget,
  ): NativeElement {
    return div()
      .id(id)
      .flex_none()
      .p(3)
      .rounded(4)
      .text_color(palette.dim ?? palette.muted ?? "")
      .hover((element) => element.bg(palette.hover).text_color(palette.foreground))
      .on_click((_event, context) => {
        if (this.closed) return;
        context.stop_propagation();
        this.dispatchPane(action, target);
      })
      .child(svg(`mods/pane/${iconName}.svg`).size(14));
  }

  private dispatchPane(action: PaneAction, target: PaneTarget): void {
    if (this.closed) return;
    const resolved = paneAction(action, target, panes());
    if (resolved) run(resolved.command, resolved.args);
  }

  private statusClock(palette: Record<string, string>): NativeElement {
    return h_flex()
      .id("workspace-chrome-clock-row")
      .size_full()
      .px(14)
      .items_center()
      .bg(palette.chrome)
      .border_t(1)
      .border_color(palette.border)
      .text_size(11.8)
      .text_color(palette.dim)
      .child(div().flex_1())
      .child(
        div()
          .id("workspace-chrome-clock")
          .child(this.clockText || formatLocalClock(this.now())),
      );
  }
}
