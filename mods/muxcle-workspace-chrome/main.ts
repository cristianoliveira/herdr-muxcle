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
import { h_flex, v_flex } from "gpui-base";
import { closeOverlay, home, layout, openOverlay, panes, props, run, spaces, theme, window } from "herdr";
import {
  capturePaneTarget,
  formatLocalClock,
  modeFor,
  panelAction,
  panelState,
  paneAction,
  panePresentation,
  roleFor,
  tabAction,
  tabLabel,
  tabMove,
  windowControlsAllowed,
  type PanelTargets,
  type PaneAction,
  type PaneTarget,
  type TabTarget,
  type WorkspaceChromeMode,
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

function idProp(value: unknown, fallback: string): string {
  return typeof value === "string" && value.length > 0 ? value : fallback;
}

export default class MuxcleWorkspaceChrome extends View {
  private role: WorkspaceChromeRole | null = null;
  private mode: WorkspaceChromeMode | null = null;
  private paneId: string | null = null;
  private spaceId: string | null = null;
  private tabId: string | null = null;
  private panelTargets: PanelTargets = { panel: "panel", stack: "panel-body", child: "files" };
  private panelChildren = { files: "files", changes: "changes" };
  private enabledPanels = ["files", "changes"];
  private windowControlOption: unknown;
  private hovered = false;
  private closed = false;
  private dragSource: TabTarget | null = null;
  private clockText = "";
  private clockTask: Task | null = null;

  init(initialProps: Props | undefined, cx: AsyncContext): void {
    const configured = (initialProps ?? props() ?? {}) as Record<string, unknown>;
    this.role = roleFor(configured.role);
    this.mode = modeFor(configured.mode);
    this.paneId = typeof configured.pane === "string" ? configured.pane : null;
    this.spaceId = typeof configured.space === "string" ? configured.space : null;
    this.tabId = typeof configured.tab === "string" ? configured.tab : null;
    this.panelTargets = {
      panel: idProp(configured.panel, "panel"),
      stack: idProp(configured.stack, "panel-body"),
      child: idProp(configured.filesPanel, "files"),
    };
    this.panelChildren = {
      files: idProp(configured.filesPanel, "files"),
      changes: idProp(configured.changesPanel, "changes"),
    };
    if (Array.isArray(configured.panels)) {
      this.enabledPanels = configured.panels.filter(
        (panel): panel is string => panel === "files" || panel === "changes",
      );
    }
    this.windowControlOption = configured.windowControls;

    if (this.role === "status-clock") {
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
    this.dragSource = null;
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
    if (this.role === "workspace-bar") return this.workspaceBar(palette);
    if (this.role === "tab-picker") return this.tabPicker(palette);
    if (this.role === "tab-actions") return this.tabActions(palette);
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

  private workspaceBar(palette: Record<string, string>): NativeElement {
    const mode = this.mode;
    if (!mode) return div();

    const currentSpaces = spaces();
    const activeSpace = currentSpaces.find((space) => space.active);
    const space = this.spaceId
      ? currentSpaces.find((candidate) => candidate.id === this.spaceId && candidate.active)
      : activeSpace;
    const newTabSpace = this.spaceId ?? activeSpace?.id ?? null;
    const root = h_flex()
      .id(`workspace-chrome-bar-${mode}`)
      .size_full()
      .min_w(0)
      .px(10)
      .gap(4)
      .items_center()
      .bg(palette.chrome)
      .border_t(1)
      .border_color(palette.border)
      .overflow_x_scrollbar()
      .on_mouse_down("left", () => {
        this.dragSource = null;
      })
      .on_mouse_up("left", () => {
        this.dragSource = null;
      })
      .on_mouse_down_out(() => {
        this.dragSource = null;
      });

    if (mode !== "panels") {
      root.child(this.tabStrip(palette, space));
      root.child(this.actionButton(palette, "tab-new", "+", () => this.openNewTab(newTabSpace)));
    } else {
      root.child(this.actionButton(palette, "tabs-open", "Tabs", () => this.openTabPicker(space)));
      root.child(this.actionButton(palette, "tab-new", "+", () => this.openNewTab(newTabSpace)));
    }

    if (mode !== "tabs") {
      root.child(this.panelButton(palette, "files", "Files", "mods/files/file.svg"));
      root.child(this.panelButton(palette, "changes", "Changes", "mods/changes/changes.svg"));
    }

    const currentWindow = window();
    if (windowControlsAllowed(currentWindow, this.windowControlOption)) {
      root.child(
        this.actionButton(
          palette,
          "window-minimize",
          currentWindow?.platform === "windows" ? svg("mods/tabs/win-min.svg").size(16) : "−",
          () => run("window.minimize"),
        ),
      );
      root.child(
        this.actionButton(
          palette,
          "window-maximize",
          currentWindow?.platform === "windows"
            ? svg(`mods/tabs/${currentWindow.maximized ? "win-restore" : "win-max"}.svg`).size(16)
            : "□",
          () => run("window.maximize"),
        ),
      );
      root.child(
        this.actionButton(
          palette,
          "window-close",
          currentWindow?.platform === "windows"
            ? svg("mods/tabs/win-close.svg").size(16)
            : svg("mods/pane/close.svg").size(13),
          () => run("window.close"),
        ),
      );
    }

    return root;
  }

  private tabStrip(
    palette: Record<string, string>,
    space: ReturnType<typeof spaces>[number] | undefined,
  ): NativeElement {
    if (!space) return h_flex().id("workspace-chrome-tabs-scroll").flex_1().min_w(0).h_full();
    return h_flex()
      .id("workspace-chrome-tabs-scroll")
      .flex_1()
      .min_w(0)
      .h_full()
      .items_center()
      .gap(3)
      .overflow_x_scrollbar()
      .children(space.tabs.map((tab) => this.tabItem(palette, space, tab)));
  }

  private tabItem(
    palette: Record<string, string>,
    space: ReturnType<typeof spaces>[number],
    tab: ReturnType<typeof spaces>[number]["tabs"][number],
  ): NativeElement {
    const target: TabTarget = { space: space.id, tab: tab.id };
    const currentPanes = panes();
    const programPane =
      currentPanes.find((pane) => pane.tab === tab.id && pane.program?.agent) ??
      currentPanes.find((pane) => pane.tab === tab.id);
    const name = tabLabel(tab, programPane?.program?.name ?? null);
    return h_flex()
      .id(`workspace-chrome-tab-${tab.id}`)
      .h(29)
      .px(10)
      .gap(7)
      .rounded(7)
      .items_center()
      .flex_none()
      .text_size(12.8)
      .border(1)
      .border_color(tab.active ? palette.border : palette.chrome)
      .bg(tab.active ? palette.raised : palette.chrome)
      .text_color(tab.active ? palette.foreground : palette.muted)
      .hover((element) => element.bg(palette.hover))
      .on_mouse_down("left", (event, context) => {
        if (this.closed) return;
        context.stop_propagation();
        const clickCount = (event as { click_count?: number }).click_count;
        this.dragSource = clickCount === 2 ? null : target;
        if (clickCount === 2) this.dispatchTab("rename", target);
      })
      .on_mouse_up("left", (_event, context) => {
        if (this.closed) return;
        context.stop_propagation();
        const source = this.dragSource;
        this.dragSource = null;
        if (!source) return;
        if (source.tab === target.tab && source.space === target.space) this.dispatchTab("select", target);
        else this.dispatchMove(source, target);
      })
      .on_mouse_down("right", (_event, context) => {
        if (this.closed) return;
        context.stop_propagation();
        this.openTabMenu(target);
      })
      .when(Boolean(programPane?.program?.icon), (element) =>
        element.child(icon(programPane?.program, 14, palette.muted) ?? div()),
      )
      .child(
        div()
          .max_w(170)
          .min_w(0)
          .truncate()
          .child(tab.zoomed ? `${name} Z` : name),
      )
      .when(tab.status === "working", (element) =>
        element.child(
          svg("mods/workspace-chrome/spinner.svg").size(12).flex_none().text_color(palette.working).spin(900),
        ),
      )
      .when(tab.status === "blocked" || tab.status === "done", (element) =>
        element.child(
          div()
            .size(6)
            .flex_none()
            .rounded(3)
            .bg(tab.status === "blocked" ? palette.blocked : palette.done),
        ),
      )
      .when(tab.active, (element) =>
        element.child(
          div()
            .id(`workspace-chrome-tab-close-${tab.id}`)
            .flex_none()
            .on_mouse_down("left", (_event, context) => context.stop_propagation())
            .on_click((_event, context) => {
              if (this.closed) return;
              context.stop_propagation();
              this.dispatchTab("close", target);
            })
            .child(svg("mods/pane/close.svg").size(12)),
        ),
      );
  }

  private actionButton(
    palette: Record<string, string>,
    id: string,
    label: string | NativeElement,
    action: () => void,
  ): NativeElement {
    return div()
      .id(`workspace-chrome-${id}`)
      .h(26)
      .flex_none()
      .flex()
      .items_center()
      .justify_center()
      .gap(5)
      .px(typeof label === "string" && label.length > 1 ? 8 : 0)
      .rounded(6)
      .text_color(palette.dim ?? palette.muted ?? "")
      .hover((element) => element.bg(palette.hover).text_color(palette.foreground))
      .on_mouse_down("left", (_event, context) => context.stop_propagation())
      .on_click(() => {
        if (!this.closed) action();
      })
      .child(label);
  }

  private panelButton(
    palette: Record<string, string>,
    child: "files" | "changes",
    label: string,
    asset: string,
  ): NativeElement {
    const targets = { ...this.panelTargets, child: this.panelChildren[child] };
    const state = panelState(layout(), targets);
    const selected = state.visible && state.activeChild === targets.child;
    return h_flex()
      .id(`workspace-chrome-panel-${child}`)
      .h(26)
      .px(8)
      .gap(5)
      .flex_none()
      .items_center()
      .rounded(6)
      .text_size(12)
      .bg(selected ? palette.selected : palette.chrome)
      .text_color(selected ? palette.foreground : palette.muted)
      .when(state.available && this.enabledPanels.includes(child), (element) =>
        element.hover((hover) => hover.bg(palette.hover)),
      )
      .on_mouse_down("left", (_event, context) => context.stop_propagation())
      .on_click(() => {
        if (this.closed || !this.enabledPanels.includes(child)) return;
        const commands = panelAction(targets, layout());
        for (const command of commands ?? []) run(command.command, command.args);
      })
      .when(!state.available || !this.enabledPanels.includes(child), (element) => element.disabled(true))
      .child(svg(asset).size(14))
      .child(label);
  }

  private dispatchTab(action: "select" | "close" | "rename", target: TabTarget): void {
    if (this.closed) return;
    const command = tabAction(action, target, spaces());
    if (!command) return;
    if (this.role === "tab-picker" || this.role === "tab-actions") this.closeCurrentOverlay();
    run(command.command, command.args);
  }

  private dispatchMove(source: TabTarget, destination: TabTarget): void {
    if (this.closed) return;
    const command = tabMove(source, destination, spaces());
    if (command) run(command.command, command.args);
  }

  private openNewTab(expectedSpace: string | null, closeCurrentOverlay = false): void {
    if (this.closed) return;
    const currentSpaces = spaces();
    if (expectedSpace === null) {
      if (currentSpaces.length > 0) return;
    } else {
      const activeSpaces = currentSpaces.filter((space) => space.active);
      if (activeSpaces.length !== 1 || activeSpaces[0]?.id !== expectedSpace) return;
    }
    if (closeCurrentOverlay) this.closeCurrentOverlay();
    openOverlay({ mod: "new-menu", kind: "popup", width: 250, height: 512 });
  }

  private openTabPicker(space: ReturnType<typeof spaces>[number] | undefined): void {
    if (this.closed || !space) return;
    openOverlay({
      mod: "muxcle-workspace-chrome",
      kind: "popup",
      width: 360,
      height: 440,
      props: { role: "tab-picker", space: space.id },
    });
  }

  private openTabMenu(target: TabTarget): void {
    if (this.closed || !tabAction("rename", target, spaces())) return;
    openOverlay({
      mod: "muxcle-workspace-chrome",
      kind: "popup",
      width: 200,
      height: 132,
      props: { role: "tab-actions", space: target.space, tab: target.tab },
    });
  }

  private closeCurrentOverlay(): void {
    const overlay = props()?.overlay;
    if (typeof overlay === "string") closeOverlay(overlay);
  }

  private tabActions(palette: Record<string, string>): NativeElement {
    const target: TabTarget = { space: this.spaceId ?? "", tab: this.tabId ?? "" };
    const valid = Boolean(tabAction("rename", target, spaces()));
    const item = (id: string, label: string, action: () => void) =>
      div()
        .id(`workspace-chrome-tab-action-${id}`)
        .h(32)
        .px(10)
        .items_center()
        .rounded(5)
        .text_color(palette.foreground)
        .when(valid, (element) => element.hover((hover) => hover.bg(palette.hover)))
        .on_click(() => {
          if (!this.closed && valid) action();
        })
        .child(label);

    return v_flex()
      .id("workspace-chrome-tab-actions")
      .w_full()
      .p(5)
      .gap(2)
      .bg(palette.popover)
      .child(item("rename", "Rename", () => this.dispatchTab("rename", target)))
      .child(
        item("new", "New tab", () => {
          if (!tabAction("rename", target, spaces())) return;
          this.openNewTab(target.space, true);
        }),
      )
      .child(item("close", "Close", () => this.dispatchTab("close", target)));
  }

  private tabPicker(palette: Record<string, string>): NativeElement {
    const currentSpaces = spaces();
    const space = this.spaceId
      ? currentSpaces.find((candidate) => candidate.id === this.spaceId && candidate.active)
      : currentSpaces.find((candidate) => candidate.active);
    if (!space) {
      return v_flex().w_full().p(10).text_color(palette.dim).child("Tab list unavailable for this workspace");
    }

    return v_flex()
      .id("workspace-chrome-tab-picker")
      .w_full()
      .min_h(0)
      .max_h(440)
      .p(6)
      .gap(3)
      .bg(palette.popover)
      .text_size(12.8)
      .overflow_y_scrollbar()
      .on_mouse_down("left", () => {
        this.dragSource = null;
      })
      .on_mouse_up("left", () => {
        this.dragSource = null;
      })
      .on_mouse_down_out(() => {
        this.dragSource = null;
      })
      .child(
        this.actionButton(palette, "picker-new-tab", "New tab", () => {
          if (this.closed) return;
          this.openNewTab(space.id, true);
        }),
      )
      .children(space.tabs.map((tab) => this.pickerTab(palette, space, tab)));
  }

  private pickerTab(
    palette: Record<string, string>,
    space: ReturnType<typeof spaces>[number],
    tab: ReturnType<typeof spaces>[number]["tabs"][number],
  ): NativeElement {
    const target: TabTarget = { space: space.id, tab: tab.id };
    const currentPanes = panes();
    const programPane =
      currentPanes.find((pane) => pane.tab === tab.id && pane.program?.agent) ??
      currentPanes.find((pane) => pane.tab === tab.id);
    const name = tabLabel(tab, programPane?.program?.name ?? null);
    return h_flex()
      .id(`workspace-chrome-picker-tab-${tab.id}`)
      .h(32)
      .min_w(0)
      .flex_none()
      .px(8)
      .gap(8)
      .items_center()
      .rounded(6)
      .text_color(tab.active ? palette.foreground : palette.muted)
      .bg(tab.active ? palette.selected : palette.popover)
      .hover((element) => element.bg(palette.hover))
      .on_mouse_down("left", (event, context) => {
        if (this.closed) return;
        context.stop_propagation();
        const clickCount = (event as { click_count?: number }).click_count;
        this.dragSource = clickCount === 2 ? null : target;
        if (clickCount === 2) this.dispatchTab("rename", target);
      })
      .on_mouse_up("left", (_event, context) => {
        if (this.closed) return;
        context.stop_propagation();
        const source = this.dragSource;
        this.dragSource = null;
        if (!source) return;
        if (source.tab === target.tab && source.space === target.space) this.dispatchTab("select", target);
        else this.dispatchMove(source, target);
      })
      .on_mouse_down("right", (_event, context) => {
        if (this.closed) return;
        context.stop_propagation();
        this.openTabMenu(target);
      })
      .child(
        div()
          .flex_1()
          .min_w(0)
          .truncate()
          .child(tab.zoomed ? `${name} Z` : name),
      )
      .child(
        div()
          .id(`workspace-chrome-picker-close-${tab.id}`)
          .flex_none()
          .p(4)
          .on_mouse_down("left", (_event, context) => context.stop_propagation())
          .on_click((_event, context) => {
            if (this.closed) return;
            context.stop_propagation();
            this.dispatchTab("close", target);
          })
          .child(svg("mods/pane/close.svg").size(12)),
      );
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
