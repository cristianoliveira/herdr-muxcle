import { View, div, type Context, type AsyncContext, type NativeElement } from "gpui-kit";
import { h_flex, v_flex, Input, InputState, v_virtual_list, VirtualListScrollHandle } from "gpui-base";
import {
  agents,
  appHome,
  closeOverlay,
  focused,
  hc,
  layout,
  panes,
  props,
  readTextFile,
  run,
  shared,
  spaces,
  terminals,
  theme,
} from "herdr";
import {
  closeTargetIsCurrent,
  connectedPeerIsCurrent,
  hasVisibleHistoryBlock,
  parseConnectedPeers,
  parsePickerConfig,
  pickerManagementActions,
  pickerRows,
  selectedRowKey,
  selectionAction,
  type PickerCloseTarget,
  type PickerFocusedContext,
  type PickerManagementAction,
  type PickerOrder,
  type PickerPeer,
  type PickerRow,
  type PickerSpace,
} from "./model.js";

const MOD_NAME = "muxcle-picker";
const RECENT_TABS_KEY = "muxcle-history.recent-tabs.v1";

type RemoteMachineState = "disabled" | "loading" | "ready" | "unavailable";
type RemoteManagementAction =
  | (Extract<PickerManagementAction, { kind: "new-tab" }> & { machine: string; peerId: string })
  | Extract<PickerManagementAction, { kind: "new-peer-space" }>;

export default class MuxclePicker extends View {
  private input!: InputState;
  private focus!: ReturnType<Context["focus_handle"]>;
  private scroll!: VirtualListScrollHandle;
  private managementScroll!: VirtualListScrollHandle;
  private selected: string | null = null;
  private managementSelected: string | null = null;
  private selectionInvalidated = false;
  private query = "";
  private message = "";
  private closed = false;
  private order: PickerOrder = "native";
  private agentContext = false;
  private management = false;
  private remoteSpaces = false;
  private remoteMachineState: RemoteMachineState = "disabled";
  private connectedPeers: PickerPeer[] | null = null;
  private machineGeneration = 0;
  private actionGeneration = 0;
  private actionPending = false;
  private closeReview: PickerCloseTarget | null = null;
  private closeReviewGeneration = 0;
  private closeAttempted = false;

  init(_props: Record<string, unknown> | undefined, cx: AsyncContext): void {
    this.focus = cx.focus_handle();
    this.scroll = VirtualListScrollHandle.new();
    this.managementScroll = VirtualListScrollHandle.new();
    this.input = InputState.new({ placeholder: "Search spaces, tabs, machines, and agents…" });
    this.input.on("change", (_event, eventCx) => {
      if (this.actionPending && !this.closeReview) {
        this.actionGeneration += 1;
        this.actionPending = false;
      }
      this.query = this.input.value().slice(0, 256);
      this.managementSelected = null;
      this.selectionInvalidated = false;
      const rows = this.rows();
      this.selected = rows[0]?.key ?? null;
      this.message = "";
      this.scrollToSelection(rows);
      eventCx.notify();
    });
    this.input.on("submit", (_event, eventCx) => {
      if (this.closed || this.closeReview || this.actionPending) return;
      if (this.managementSelected) {
        const action = this.managementActions().find((candidate) => candidate.key === this.managementSelected);
        if (action) void this.handleManagementAction(action.key, eventCx);
        else this.managementSelected = null;
        return;
      }
      if (this.selected) this.choose(this.selected, eventCx);
    });
    this.input.focus();
    cx.spawn(async (taskCx) => {
      try {
        const config = parsePickerConfig(await readTextFile(appHomePath("data", MOD_NAME, "config.json")));
        this.order = config.order;
        this.agentContext = config.agentContext;
        this.management = config.management;
        this.remoteSpaces = config.management && config.remoteSpaces;
      } catch {
        this.order = "native";
        this.agentContext = false;
        this.management = false;
        this.remoteSpaces = false;
      }

      if (this.remoteSpaces && !this.closed) {
        this.remoteMachineState = "loading";
        const generation = ++this.machineGeneration;
        const machines = await this.loadConnectedPeers();
        if (this.closed || generation !== this.machineGeneration) return;
        this.connectedPeers = machines;
        this.remoteMachineState = machines === null ? "unavailable" : "ready";
      }
      if (!this.closed) taskCx.notify();
    });
  }

  close(): void {
    this.closed = true;
    this.machineGeneration += 1;
    this.actionGeneration += 1;
    this.actionPending = false;
    this.closeReviewGeneration += 1;
    this.closeReview = null;
  }

  render(_cx: Context): NativeElement {
    const palette = theme();
    if (this.closeReview) {
      return this.renderCloseReview(palette, this.closeReview, this.closeReviewGeneration);
    }

    const rows = this.rows();
    const previous = this.selected;
    this.selected = selectedRowKey(rows, previous, this.selectionInvalidated);
    this.selectionInvalidated = this.selectionInvalidated || (previous !== null && this.selected === null);
    const actions = this.managementActions();
    if (!actions.some((action) => action.key === this.managementSelected)) this.managementSelected = null;
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
        } else if (!this.actionPending && (event.keystroke === "down" || event.keystroke === "ctrl-j")) {
          this.move(1);
        } else if (!this.actionPending && (event.keystroke === "up" || event.keystroke === "ctrl-k")) {
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
          .h(this.management ? 60 : 80)
          .text_color(palette.dim)
          .child(this.query ? "No matching spaces or tabs." : "No spaces are open."),
      );
    } else {
      surface.child(
        v_flex()
          .h(this.management ? 230 : 320)
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
                        .truncate()
                        .child(
                          display([row.machine ?? "local", contextSummary(row.context)].filter(Boolean).join(" · ")),
                        ),
                    ),
                ),
            )
              .track_scroll(this.scroll)
              .on_item_click((key, cx) => this.choose(key, cx)),
          ),
      );
    }

    if (this.message) surface.child(div().text_color(palette.foreground).child(this.message));
    const remoteMessage = this.remoteStatusMessage();
    if (remoteMessage) surface.child(div().text_size(11).text_color(palette.dim).child(remoteMessage));

    if (this.management) {
      const management = v_flex()
        .gap(4)
        .child(div().text_size(11).font_semibold().text_color(palette.dim).child("Manage"));
      if (actions.length > 0) {
        management.child(
          v_virtual_list(
            "muxcle-picker-management-actions",
            actions.length,
            34,
            (index) => actions[index].key,
            (range) =>
              rangeItems(actions, range.start, range.end).map((action) =>
                h_flex()
                  .h(34)
                  .px(8)
                  .items_center()
                  .gap(8)
                  .rounded(5)
                  .cursor_pointer()
                  .bg(
                    action.kind === "close-tab"
                      ? palette.ansi1
                      : action.key === this.managementSelected
                        ? palette.hover
                        : palette.background,
                  )
                  .text_color(action.kind === "close-tab" ? "#ffffff" : palette.foreground)
                  .child(
                    div()
                      .text_size(11)
                      .text_color(action.kind === "close-tab" ? "#ffffff" : palette.dim)
                      .child(action.kind === "close-tab" ? "Review close" : "Create"),
                  )
                  .child(div().text_size(12).truncate().child(display(action.label))),
              ),
          )
            .h(Math.min(136, actions.length * 34))
            .track_scroll(this.managementScroll)
            .on_item_click((key, cx) => this.handleManagementAction(key, cx)),
        );
      }
      surface.child(management);
    }

    surface.child(
      div()
        .text_size(11)
        .text_color(palette.dim)
        .child(
          this.management
            ? `${rows.length} results · arrows move into Manage · Enter selects or runs highlighted action`
            : `${rows.length} results · ↑/↓ or Ctrl-J/K · Enter to select`,
        ),
    );
    return surface;
  }

  private renderCloseReview(
    palette: ReturnType<typeof theme>,
    target: PickerCloseTarget,
    reviewGeneration: number,
  ): NativeElement {
    const location =
      target.machine === null
        ? `local · ${reviewDisplay(target.spaceName)}`
        : `${reviewDisplay(target.machine)} · Core ${reviewDisplay(target.peerId ?? "identity unavailable")} · ${reviewDisplay(target.spaceName)}`;
    const resourceLines = target.panes.map((pane) => {
      const resource = pane.terminal
        ? `terminal ${reviewDisplay(pane.terminal)}`
        : pane.mod
          ? `mod ${reviewDisplay(pane.mod)}`
          : "no terminal";
      const shown =
        target.focusedPane?.pane === pane.pane && target.focusedPane.shown
          ? ` · shown terminal ${reviewDisplay(target.focusedPane.shown)}`
          : "";
      return `${reviewDisplay(pane.pane)}: ${resource}${shown}`;
    });
    const surface = v_flex()
      .id("muxcle-picker-close-review")
      .w(600)
      .max_h(580)
      .min_h(0)
      .p(16)
      .gap(10)
      .bg(palette.background)
      .rounded(12)
      .track_focus(this.focus)
      .on_key_down((event, cx) => {
        if (event.keystroke !== "escape") return;
        this.cancelCloseReview(cx);
        cx.stop_propagation();
        cx.notify();
      })
      .child(div().font_semibold().text_color(palette.ansi1).child("Review tab close"))
      .child(
        div()
          .text_size(10)
          .text_color(palette.dim)
          .child("Long names and IDs are shortened for display; checks retain full native values."),
      )
      .child(
        div()
          .text_color(palette.foreground)
          .child(
            `${reviewDisplay(target.tabName)} · ${location} · ${target.panes.length} pane${target.panes.length === 1 ? "" : "s"}`,
          ),
      )
      .child(v_flex().gap(3).child(div().text_size(11).text_color(palette.dim).child("Reviewed pane resources:")));

    const resources = v_flex().id("muxcle-picker-close-resources").max_h(220).min_h(0).overflow_y_scrollbar().gap(3);
    for (const line of resourceLines) {
      resources.child(div().text_size(11).text_color(palette.dim).child(display(line)));
    }
    surface.child(resources);
    surface.child(
      div()
        .text_size(12)
        .text_color(palette.foreground)
        .child(
          "Closing the tab closes every listed pane and may end its terminal. Herdr may ask for native confirmation.",
        ),
    );
    surface.child(
      div()
        .text_size(11)
        .text_color(palette.dim)
        .child(
          this.closeAttempted
            ? "The close command status is uncertain. Check the tab before trying again."
            : this.actionPending
              ? "Checking the exact tab and connected machine…"
              : "The tab, parent space, machine, pane IDs, and resources will be checked again before sending.",
        ),
    );
    surface.child(
      h_flex()
        .id("muxcle-picker-close-actions")
        .flex_none()
        .gap(8)
        .justify_between()
        .child(this.button("muxcle-picker-close-cancel", "Cancel · Esc", (cx) => this.cancelCloseReview(cx), palette))
        .child(
          this.button(
            "muxcle-picker-close-confirm",
            "Close tab and panes",
            (cx) => this.confirmClose(target, reviewGeneration, cx),
            palette,
            true,
            this.closeAttempted || this.actionPending,
          ),
        ),
    );
    return surface;
  }

  private button(
    id: string,
    label: string,
    action: (cx: Context) => void | Promise<void>,
    palette: ReturnType<typeof theme>,
    danger = false,
    disabled = false,
  ): NativeElement {
    return div()
      .id(id)
      .px(12)
      .py(8)
      .rounded(5)
      .cursor_pointer()
      .bg(danger ? palette.ansi1 : palette.hover)
      .text_color(danger ? "#ffffff" : palette.foreground)
      .on_click((_event, cx) => {
        if (!disabled) return action(cx);
      })
      .child(label);
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
    const agentSnapshot = agents();
    let terminalSnapshot: unknown = null;
    if (this.agentContext) {
      try {
        terminalSnapshot = terminals();
      } catch {
        terminalSnapshot = null;
      }
    }
    return pickerRows(spaces(), this.query, {
      agents: agentSnapshot,
      order: this.order,
      recentState,
      historyBlockVisible,
      agentContext: this.agentContext,
      terminals: terminalSnapshot,
    });
  }

  private managementActions(): PickerManagementAction[] {
    if (!this.management) return [];

    let focusedContext: PickerFocusedContext | null = null;
    let paneSnapshot: unknown = null;
    try {
      focusedContext = focused();
    } catch {
      focusedContext = null;
    }
    try {
      paneSnapshot = panes();
    } catch {
      paneSnapshot = null;
    }

    return pickerManagementActions(spaces(), {
      enabled: this.management,
      remoteSpaces: this.remoteSpaces,
      connectedPeers: this.remoteMachineState === "ready" ? this.connectedPeers : null,
      focused: focusedContext,
      selectedKey: this.selected,
      panes: paneSnapshot,
    });
  }

  private remoteStatusMessage(): string {
    if (!this.remoteSpaces) return "";
    if (this.remoteMachineState === "loading") return "Checking connected machines…";
    if (this.remoteMachineState === "unavailable")
      return "Could not verify connected machines. Remote-space actions are unavailable.";
    if (this.remoteMachineState === "ready" && this.connectedPeers?.length === 0) return "No connected machines.";
    if (this.remoteMachineState === "ready" && this.connectedPeers?.some((peer) => peer.temporary === true))
      return "Herdr does not support remote document actions for temporary machines.";
    return "";
  }

  private move(delta: -1 | 1): void {
    const rows = this.rows();
    const actions = this.managementActions();
    if (this.managementSelected) {
      const current = actions.findIndex((action) => action.key === this.managementSelected);
      const next = current + delta;
      if (next >= 0 && next < actions.length) {
        this.managementSelected = actions[next].key;
        this.managementScroll.scroll_to_item(next, "center");
      } else if (delta < 0 && rows.length > 0) {
        this.managementSelected = null;
        this.selected = rows[rows.length - 1].key;
        this.scrollToSelection(rows);
      }
      return;
    }
    if (rows.length === 0) {
      if (delta > 0 && actions.length > 0) {
        this.managementSelected = actions[0].key;
        this.managementScroll.scroll_to_item(0, "center");
      }
      return;
    }

    const current = rows.findIndex((row) => row.key === this.selected);
    if (delta > 0 && current === rows.length - 1 && actions.length > 0) {
      this.managementSelected = actions[0].key;
      this.managementScroll.scroll_to_item(0, "center");
      return;
    }
    const next = current < 0 ? 0 : Math.max(0, Math.min(rows.length - 1, current + delta));
    this.selectionInvalidated = false;
    this.selected = rows[next].key;
    this.scrollToSelection(rows);
  }

  private scrollToSelection(rows: readonly PickerRow[]): void {
    const index = rows.findIndex((row) => row.key === this.selected);
    if (index >= 0) this.scroll.scroll_to_item(index, "center");
  }

  private choose(key: string, cx: Context): void {
    if (this.closed || this.closeReview || this.actionPending) return;
    const action = selectionAction(spaces(), this.query, key, { agents: agents() });
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

  private async handleManagementAction(key: string, cx: Context): Promise<void> {
    if (this.closed || !this.management || this.closeReview || this.actionPending) return;
    const action = this.managementActions().find((candidate) => candidate.key === key);
    if (!action) {
      this.message = "That management action is no longer available. Nothing was changed.";
      cx.notify();
      return;
    }

    if (action.kind === "close-tab") {
      this.closeReviewGeneration += 1;
      this.closeReview = action.target;
      this.closeAttempted = false;
      this.message = "";
      this.focus.focus();
      cx.notify();
      return;
    }
    if (action.kind === "new-local-space") {
      this.dispatchManagement("space.new", { machine: "" }, cx);
      return;
    }
    if (action.kind === "new-tab") {
      if (action.machine === null) {
        if (!this.focusedSpaceIsCurrent(action)) {
          this.message = "The focused space changed. No tab was created; select the action again.";
          cx.notify();
          return;
        }
        this.dispatchManagement("tab.new", { space: action.spaceId }, cx);
        return;
      }
      if (this.remoteSpaces && action.peerId !== null) {
        await this.runRemoteAction({ ...action, machine: action.machine, peerId: action.peerId }, cx);
      }
      return;
    }
    if (this.remoteSpaces) await this.runRemoteAction(action, cx);
  }

  private async runRemoteAction(action: RemoteManagementAction, cx: Context): Promise<void> {
    if (this.closed || !this.management || !this.remoteSpaces || this.actionPending) return;
    this.actionPending = true;
    this.message = "Checking connected machines…";
    const generation = ++this.actionGeneration;
    cx.notify();

    const machines = await this.loadConnectedPeers();
    if (this.closed || generation !== this.actionGeneration) return;
    this.connectedPeers = machines;
    this.remoteMachineState = machines === null ? "unavailable" : "ready";

    if (machines === null || !connectedPeerIsCurrent(action.machine, action.peerId, machines)) {
      this.actionPending = false;
      this.message =
        machines === null
          ? "Could not verify connected machine identities. No remote action was sent."
          : "That machine identity changed, is no longer connected, or is temporary. No remote action was sent.";
      cx.notify();
      return;
    }
    if (action.kind === "new-tab" && !this.focusedSpaceIsCurrent(action)) {
      this.actionPending = false;
      this.message = "The focused space changed. No tab was created; select the action again.";
      cx.notify();
      return;
    }

    this.actionPending = false;
    if (action.kind === "new-tab") this.dispatchManagement("tab.new", { space: action.spaceId }, cx);
    else this.dispatchManagement("space.new", { machine: action.machine }, cx);
  }

  private async confirmClose(target: PickerCloseTarget, reviewGeneration: number, cx: Context): Promise<void> {
    if (
      !this.isCurrentCloseReview(target, reviewGeneration) ||
      this.closeAttempted ||
      this.actionPending ||
      !this.management
    ) {
      return;
    }

    this.closeAttempted = true;
    this.actionPending = true;
    const generation = ++this.actionGeneration;
    cx.notify();

    let connectedPeers: PickerPeer[] | null = null;
    if (target.machine !== null) {
      if (!this.remoteSpaces) {
        this.rejectClose("Remote management is disabled. Nothing was closed.", cx);
        return;
      }
      connectedPeers = await this.loadConnectedPeers();
      if (this.closed || generation !== this.actionGeneration || !this.isCurrentCloseReview(target, reviewGeneration)) {
        return;
      }
      this.connectedPeers = connectedPeers;
      this.remoteMachineState = connectedPeers === null ? "unavailable" : "ready";
      if (connectedPeers === null || !connectedPeerIsCurrent(target.machine, target.peerId ?? "", connectedPeers)) {
        this.rejectClose(
          connectedPeers === null
            ? "Could not verify the connected machine identity. Nothing was closed."
            : "The machine identity changed, is no longer connected, or is temporary. Nothing was closed.",
          cx,
        );
        return;
      }
    }

    let currentSpaces: PickerSpace[];
    let currentPanes: unknown;
    let currentFocus: PickerFocusedContext | null;
    try {
      currentSpaces = spaces();
      currentPanes = panes();
      currentFocus = focused();
    } catch {
      this.rejectClose("Could not verify the current tab and pane scope. Nothing was closed.", cx);
      return;
    }
    if (!closeTargetIsCurrent(target, currentSpaces, currentPanes, currentFocus, connectedPeers)) {
      this.rejectClose("The tab or pane scope changed. Nothing was closed; review the target again.", cx);
      return;
    }

    try {
      run("tab.close", { id: target.tabId });
    } catch {
      this.actionPending = false;
      this.message = "Close command status is uncertain. Check the tab before trying again.";
      cx.notify();
      return;
    }
    // run() is fire-and-forget; this dismisses only the picker, not an execution receipt.
    this.dismiss();
  }

  private rejectClose(message: string, cx: Context): void {
    this.actionPending = false;
    this.closeReviewGeneration += 1;
    this.closeReview = null;
    this.closeAttempted = false;
    this.message = message;
    cx.notify();
  }

  private cancelCloseReview(cx: Context): void {
    if (this.closed || !this.closeReview) return;
    this.actionGeneration += 1;
    this.closeReviewGeneration += 1;
    this.actionPending = false;
    this.closeReview = null;
    this.closeAttempted = false;
    this.input.focus();
    cx.notify();
  }

  private focusedSpaceIsCurrent(action: Extract<PickerManagementAction, { kind: "new-tab" }>): boolean {
    let currentFocus: PickerFocusedContext | null;
    try {
      currentFocus = focused();
    } catch {
      return false;
    }
    if (currentFocus?.space !== action.spaceId) return false;
    const matches = spaces().filter((space) => space.id === action.spaceId && space.machine === action.machine);
    return matches.length === 1;
  }

  private isCurrentCloseReview(target: PickerCloseTarget, reviewGeneration: number): boolean {
    return !this.closed && this.closeReview === target && this.closeReviewGeneration === reviewGeneration;
  }

  private async loadConnectedPeers(): Promise<PickerPeer[] | null> {
    try {
      const result = await hc(["machine", "ls", "--json"]);
      if (result.code !== 0) return null;
      return parseConnectedPeers(result.stdout);
    } catch {
      return null;
    }
  }

  private dispatchManagement(command: string, args: Record<string, unknown>, cx: Context): void {
    if (this.closed || !this.management || this.closeReview || this.actionPending) return;
    try {
      run(command, args);
    } catch {
      this.message = "Could not send the management command. Check Herdr before trying again.";
      cx.notify();
      return;
    }
    // run() is fire-and-forget; do not present dismissal as command completion.
    this.dismiss();
  }

  private dismiss(): void {
    if (this.closed) return;
    this.closed = true;
    this.machineGeneration += 1;
    this.actionGeneration += 1;
    this.closeReviewGeneration += 1;
    this.actionPending = false;
    const overlay = props()?.overlay;
    if (overlay) closeOverlay(overlay);
  }
}

function rangeItems<T>(items: readonly T[], start: number, end: number): T[] {
  return items.slice(start, end);
}

function appHomePath(...parts: string[]): string {
  const base = appHome();
  const separator = base.includes("\\") ? "\\" : "/";
  const trimmedBase = base.replace(/[\\/]+$/u, "");
  return [trimmedBase, ...parts].join(separator);
}

function contextSummary(context: PickerRow["context"]): string {
  if (!context) return "";

  const parts: string[] = [];
  if (context.descendants.kind === "exact") {
    const { count } = context.descendants;
    parts.push(`${count} live descendant${count === 1 ? "" : "s"}`);
  } else if (context.descendants.kind === "lower-bound" && context.descendants.count > 0) {
    parts.push(`at least ${context.descendants.count} live descendants`);
  } else if (context.descendants.kind === "lower-bound") {
    parts.push("live descendant count incomplete");
  } else {
    parts.push("live descendants unavailable");
  }

  if (context.status) parts.push(context.status);
  parts.push(...context.programs);
  if (context.programsTruncated) parts.push("more programs");
  return parts.join(" · ");
}

function display(value: string): string {
  return value.replace(/[\u0000-\u001f\u007f]/g, " ");
}

function reviewDisplay(value: string): string {
  const safe = value.replace(/[\u0000-\u001f\u007f-\u009f\u061c\u200e\u200f\u202a-\u202e\u2066-\u2069]/gu, " ");
  const characters = [...safe];
  return characters.length > 72 ? `${characters.slice(0, 71).join("")}…` : safe;
}
