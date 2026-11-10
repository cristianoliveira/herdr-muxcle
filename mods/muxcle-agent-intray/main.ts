import { View, div, type AsyncContext, type Context, type NativeElement } from "gpui-kit";
import {
  Button,
  h_flex,
  Input,
  InputState,
  Tab,
  Tabs,
  v_flex,
  v_virtual_list,
  VirtualListScrollHandle,
} from "gpui-base";
import { agents, closeOverlay, props, run, shared, setShared, terminals, theme, notify } from "herdr";
import {
  dismissEvent,
  dismissEvents,
  filterEvents,
  jumpCommand,
  observeEvents,
  restoreState,
  type AttentionEvent,
  type InboxState,
  type StatusFilter,
} from "./model.js";

const MOD_NAME = "muxcle-agent-intray";
const STATE_KEY = `${MOD_NAME}.state.v1`;
const STATUS_TABS: readonly [StatusFilter, string][] = [
  ["all", "All"],
  ["done", "Finished"],
  ["blocked", "Needs input"],
];

export default class MuxcleAgentIntray extends View {
  private observer = false;
  private overlay: string | undefined;
  private focus!: ReturnType<Context["focus_handle"]>;
  private input!: InputState;
  private scroll!: VirtualListScrollHandle;
  private filter = "";
  private statusFilter: StatusFilter = "all";
  private selected: number | null = null;
  private pendingDismissal: number[] | null = null;
  private mouseConfirmArmed = false;
  private message = "";

  init(_props: Record<string, unknown> | undefined, cx: AsyncContext): void {
    this.observer = props()?.role === "observer";
    this.overlay = props()?.overlay;
    if (this.observer) return;

    this.focus = cx.focus_handle();
    this.scroll = VirtualListScrollHandle.new();
    this.input = InputState.new({ placeholder: "Search notifications…" });
    this.input.on("change", (_event, eventCx) => {
      this.filter = this.input.value();
      this.selected = null;
      this.message = "";
      this.scroll.scroll_to_item(0, "center");
      eventCx.notify();
    });
    this.input.on("submit", (_event, eventCx) => {
      if (this.pendingDismissal) return;
      const rows = filterEvents(this.observe().events, this.filter, this.statusFilter);
      this.choose(rows.find((event) => event.id === this.selected) ?? rows[0], eventCx);
      eventCx.notify();
    });
    this.input.focus();
    cx.notify();
  }

  close(): void {
    this.mouseConfirmArmed = false;
    this.overlay = undefined;
  }

  render(_cx: Context): NativeElement | string {
    const state = this.observe();
    if (this.observer) return div().h(1);

    const category = filterEvents(state.events, "", this.statusFilter);
    const rows = filterEvents(category, this.filter);
    const selectedIndex = Math.max(
      0,
      rows.findIndex((event) => event.id === this.selected),
    );
    const selected = rows[selectedIndex] ?? null;
    const pendingCount = this.pendingDismissal
      ? state.events.filter((event) => this.pendingDismissal?.includes(event.id)).length
      : 0;
    const palette = theme();
    const liveAddresses = new Set(
      terminals()
        .filter(
          (terminal): terminal is { address: string; state: string } =>
            isRecord(terminal) && typeof terminal.address === "string" && typeof terminal.state === "string",
        )
        .filter((terminal) => terminal.state === "live")
        .map((terminal) => terminal.address),
    );

    const surface = v_flex()
      .id(MOD_NAME)
      .track_focus(this.focus)
      .w(700)
      .h(536)
      .p(16)
      .gap(10)
      .bg(palette.popover)
      .text_size(13)
      .on_key_down((event, cx) => {
        this.mouseConfirmArmed = false;
        if (this.pendingDismissal) {
          if (event.keystroke === "escape") {
            this.cancelDismissAll();
          } else if (event.keystroke === "ctrl-enter") {
            this.confirmDismissAll();
          }
          cx.stop_propagation();
          cx.notify();
          return;
        }

        const direct = ["ctrl-1", "ctrl-2", "ctrl-3"].indexOf(event.keystroke);
        if (event.keystroke === "escape") {
          this.closePopup();
        } else if (event.keystroke === "ctrl-shift-d") {
          this.requestDismissAll(this.observe().events);
        } else if (event.keystroke === "ctrl-enter") {
          // Plain Enter is deliberately not a confirmation path.
          return;
        } else if (direct !== -1) {
          this.selectStatus(STATUS_TABS[direct][0]);
        } else if (["tab", "shift-tab", "ctrl-h", "ctrl-l"].includes(event.keystroke)) {
          const index = STATUS_TABS.findIndex(([status]) => status === this.statusFilter);
          const step = ["tab", "ctrl-l"].includes(event.keystroke) ? 1 : -1;
          this.selectStatus(STATUS_TABS[(index + step + STATUS_TABS.length) % STATUS_TABS.length][0]);
        } else if (event.keystroke === "ctrl-d" && selected) {
          this.dismiss(selected.id);
        } else if (["down", "up", "ctrl-j", "ctrl-k"].includes(event.keystroke)) {
          const step = ["down", "ctrl-j"].includes(event.keystroke) ? 1 : -1;
          const next = rows.length ? (selectedIndex + step + rows.length) % rows.length : 0;
          this.selected = rows[next]?.id ?? null;
          this.scroll.scroll_to_item(next, "center");
        } else {
          return;
        }
        cx.stop_propagation();
        cx.notify();
      });

    const header = h_flex()
      .h(28)
      .flex_none()
      .justify_between()
      .items_center()
      .gap(10)
      .child(
        div()
          .text_color(palette.foreground)
          .text_size(this.pendingDismissal ? 12 : 13)
          .child(
            this.pendingDismissal
              ? `Dismiss ${pendingCount} reviewed unread across all statuses/search?`
              : "Agent attention inbox",
          ),
      );

    if (this.pendingDismissal) {
      header.child(
        h_flex()
          .gap(6)
          .child(this.button("dismiss-cancel", "Cancel", () => this.cancelDismissAll()))
          .child(this.confirmButton("dismiss-confirm", "Confirm · Ctrl+Enter", pendingCount === 0)),
      );
    } else {
      header.child(
        h_flex()
          .items_center()
          .gap(6)
          .child(div().text_size(11).text_color(palette.dim).child("Ctrl+Shift+D"))
          .child(
            this.button(
              "dismiss-all",
              "Dismiss all",
              () => this.requestDismissAll(this.observe().events),
              state.events.length === 0,
            ),
          ),
      );
    }

    const tabs = h_flex()
      .h(28)
      .flex_none()
      .items_center()
      .gap(10)
      .child(
        Tabs.new("intray-status")
          .flex()
          .flex()
          .flex_row()
          .flex_1()
          .gap(6)
          .children(
            STATUS_TABS.map(([status, label]) => {
              const active = status === this.statusFilter;
              const count = filterEvents(state.events, "", status).length;
              return Tab.new(`intray-status-${status}`)
                .selected(active)
                .px(10)
                .py(5)
                .rounded(5)
                .bg(active ? palette.hover : palette.popover)
                .text_color(active ? palette.accent : palette.dim)
                .cursor_pointer()
                .child(`${label} (${count})`)
                .on_click((_event, cx) => {
                  this.selectStatus(status);
                  cx.notify();
                });
            }),
          ),
      )
      .child(div().text_size(11).text_color(palette.dim).child("Tab/Shift-Tab · Ctrl-H/L · Ctrl-1/2/3"));

    const search = h_flex()
      .h(36)
      .flex_none()
      .px(10)
      .items_center()
      .rounded(5)
      .border_1()
      .border_color(palette.accent)
      .bg(palette.background)
      .child(Input.new(this.input).flex_1().h_full().text_size(13).text_color(palette.foreground));

    const list = rows.length
      ? v_virtual_list(
          "muxcle-agent-intray-events",
          rows.length,
          52,
          (index) => String(rows[index].id),
          (range) =>
            rows
              .slice(range.start, range.end)
              .map((event, offset) =>
                this.renderEvent(
                  event,
                  range.start + offset === selectedIndex,
                  liveAddresses.has(event.address),
                  palette,
                ),
              ),
        )
          .h(340)
          .w_full()
          .track_scroll(this.scroll)
          .on_item_click((key, cx) => {
            this.choose(
              rows.find((event) => String(event.id) === key),
              cx,
            );
            cx.notify();
          })
      : div()
          .flex_1()
          .text_color(palette.muted)
          .child(
            state.events.length
              ? "No matching notifications. Clear search or choose another status."
              : "No unread events. The observer or popup must be open to notice transitions; earlier transitions are not replayed.",
          );

    const footer = div()
      .text_size(11)
      .text_color(palette.dim)
      .child(
        this.pendingDismissal
          ? "Ctrl+Enter confirms · Esc cancels · new arrivals stay unread"
          : `${rows.length} of ${category.length} unread · ↑/↓ or Ctrl-J/K · Enter jumps (keeps unread) · Ctrl-D dismisses · Esc closes`,
      );

    surface.child(header).child(tabs).child(search).child(list);
    if (this.message) surface.child(div().text_color(palette.foreground).child(this.message));
    return surface.child(footer);
  }

  private observe(): InboxState {
    const raw = shared(STATE_KEY);
    const state = observeEvents(restoreState(raw), agents());
    if (!sameJson(raw, state)) setShared(STATE_KEY, state);
    return state;
  }

  private selectStatus(status: StatusFilter): void {
    this.statusFilter = status;
    this.selected = null;
    this.scroll.scroll_to_item(0, "center");
    this.input.focus();
  }

  private requestDismissAll(events: readonly AttentionEvent[]): void {
    if (events.length === 0 || this.pendingDismissal) return;
    this.pendingDismissal = events.map((event) => event.id);
    this.mouseConfirmArmed = false;
    this.input.focus();
  }

  private cancelDismissAll(): void {
    this.pendingDismissal = null;
    this.mouseConfirmArmed = false;
    this.input.focus();
  }

  private confirmDismissAll(): void {
    if (!this.pendingDismissal) return;

    const reviewedIds = this.pendingDismissal;
    this.observe();
    const state = restoreState(shared(STATE_KEY));
    const next = dismissEvents(state, reviewedIds);
    if (next !== state) setShared(STATE_KEY, next);
    this.cancelDismissAll();
    this.selected = null;
    this.scroll.scroll_to_item(0, "center");
  }

  private dismiss(id: number): void {
    this.observe();
    const state = restoreState(shared(STATE_KEY));
    const next = dismissEvent(state, id);
    if (next !== state) setShared(STATE_KEY, next);
    this.selected = null;
    this.message = "";
  }

  private choose(event: AttentionEvent | undefined, cx: Context): void {
    if (!event || this.pendingDismissal) return;
    const command = jumpCommand(event, terminals());
    if (!command) {
      this.message = "Terminal unavailable. The notification remains unread.";
      notify({ title: "Terminal unavailable", body: this.message, level: "info" });
      cx.notify();
      return;
    }
    try {
      run(...command);
    } catch (error) {
      this.message = "Could not queue focus. The notification remains unread.";
      notify({
        title: "Could not jump",
        body: error instanceof Error ? error.message : "Check Herdr and try again.",
        level: "error",
      });
      cx.notify();
      return;
    }

    // run() queues a native command; it does not acknowledge that focus changed.
    this.message = "Jump queued. This notification remains unread until you dismiss it.";
    this.closePopup();
    cx.notify();
  }

  private closePopup(): void {
    const overlay = this.overlay;
    if (!overlay) return;

    this.overlay = undefined;
    closeOverlay(overlay);
  }

  private renderEvent(
    event: AttentionEvent,
    selected: boolean,
    live: boolean,
    palette: Record<string, string>,
  ): NativeElement {
    return v_flex()
      .h(52)
      .px(10)
      .py(5)
      .gap(3)
      .rounded(5)
      .bg(selected ? palette.hover : palette.popover)
      .child(
        h_flex()
          .gap(10)
          .items_center()
          .child(
            div()
              .text_color(event.status === "blocked" ? palette.blocked : palette.done)
              .child(event.status === "blocked" ? "Needs input" : "Finished"),
          )
          .child(
            div()
              .flex_1()
              .truncate()
              .text_color(palette.foreground)
              .child(event.title || event.tab || event.address),
          ),
      )
      .child(
        div()
          .truncate()
          .text_size(11)
          .text_color(palette.dim)
          .child([event.space, event.tab, live ? event.address : "unavailable"].filter(Boolean).join(" · ")),
      );
  }

  private button(id: string, label: string, action: () => void, disabled = false): NativeElement {
    const palette = theme();
    return Button.new(id)
      .px(10)
      .py(4)
      .rounded(5)
      .bg(palette.hover)
      .text_color(disabled ? palette.dim : palette.foreground)
      .disabled(disabled)
      .cursor_pointer()
      .child(label)
      .on_click((_event, cx) => {
        if (disabled) return;
        action();
        cx.notify();
      });
  }

  private confirmButton(id: string, label: string, disabled: boolean): NativeElement {
    const palette = theme();
    return Button.new(id)
      .px(10)
      .py(4)
      .rounded(5)
      .bg(palette.hover)
      .text_color(disabled ? palette.dim : palette.foreground)
      .disabled(disabled)
      .cursor_pointer()
      .child(label)
      .on_mouse_down("left", (_event, cx) => {
        if (disabled || !this.pendingDismissal) return;
        this.mouseConfirmArmed = true;
        cx.stop_propagation();
      })
      .on_click((_event, cx) => {
        const pointerAuthorized = this.mouseConfirmArmed;
        this.mouseConfirmArmed = false;
        if (!pointerAuthorized || disabled || !this.pendingDismissal) return;
        this.confirmDismissAll();
        cx.notify();
      });
  }
}

function sameJson(left: unknown, right: unknown): boolean {
  try {
    return JSON.stringify(left) === JSON.stringify(right);
  } catch {
    return false;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
