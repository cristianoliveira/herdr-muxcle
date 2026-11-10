import { View, type AsyncContext, type Context, type NativeElement, type Task } from "gpui-kit";
import { div } from "gpui-kit";
import { h_flex } from "gpui-base";
import { exec, home, layout, notify, panes, props, run, setShared, shared, spaces, theme } from "herdr";
import { layoutHasMod, PERSISTED_CURSOR_KEY, statusColor, watcherBinary, type MonitorValue } from "./model.js";
import { WatcherLocations } from "./location.js";
import { ProjectWatchers } from "./projects.js";

const POLL_INTERVAL_MS = 3000;

function stateLabel(state: MonitorValue["state"]): string {
  switch (state) {
    case "no-project":
      return "no project";
    case "remote-disabled":
      return "remote off";
    case "unsupported":
      return "unsupported";
    case "invalid":
      return "invalid status";
    case "restarting":
      return "restarting";
    case "offline":
      return "offline";
    case "loading":
      return "checking";
    case "limit":
      return "monitor limit";
    default:
      return state;
  }
}

export default class MuxcleFunzzyStatus extends View {
  private locations!: WatcherLocations;
  private watchers!: ProjectWatchers;
  private timer: Task | undefined;
  private polling = false;
  private closed = false;

  init(_props: Record<string, unknown> | undefined, cx: AsyncContext): void {
    const options = (props() ?? {}) as Record<string, unknown>;
    const localBinary = watcherBinary(options.binary, home());
    const remoteBinary =
      typeof options.remoteBinary === "string" && options.remoteBinary.trim() ? options.remoteBinary.trim() : "fzz";

    this.locations = new WatcherLocations({ spaces, panes, exec });
    this.watchers = new ProjectWatchers({
      spaces,
      exec,
      notify,
      binary: localBinary,
      remoteBinary,
      remoteEnabled: options.remote === true,
      readPersisted: () => shared(PERSISTED_CURSOR_KEY),
      writePersisted: (key, value) => setShared(key, value),
    });

    const poll = (taskCx: AsyncContext) => {
      if (this.closed || this.polling) return;
      this.watchers.sync();
      if (!layoutHasMod(layout(), "muxcle-funzzy-status") || !this.watchers.hasProjects()) return;

      this.polling = true;
      taskCx.spawn(async (pollCx) => {
        try {
          await this.locations.refresh();
          await this.watchers.poll();
        } finally {
          this.polling = false;
          if (!this.closed) pollCx.notify();
        }
      });
    };

    this.timer = cx.timer.every(POLL_INTERVAL_MS, poll);
    poll(cx);
  }

  close(): void {
    this.closed = true;
    this.timer?.cancel();
    this.timer = undefined;
    this.watchers?.close();
    this.locations?.close();
  }

  render(_cx: Context): NativeElement {
    this.watchers.sync();
    const value = this.watchers.current();
    const active = spaces().find((space) => space.active);
    const folder = active?.folder ?? "";
    const matches = active && !active.machine ? this.locations.forFolder(folder) : [];
    const target = active && !active.machine ? this.locations.unique(folder) : null;
    const location = target ? ` · ${target.name}` : matches.length > 1 ? ` · ${matches.length} watcher panes` : "";
    const generation = value.generation === undefined ? "" : ` #${value.generation}`;
    const failures = value.failures ? ` · ${value.failures} failures` : "";
    const palette = theme();
    const bar = h_flex()
      .w_full()
      .h(24)
      .px(6)
      .items_center()
      .bg(palette.chrome)
      .text_size(11.8)
      .child(
        div()
          .truncate()
          .text_color(statusColor(value.state, palette))
          .child(`fzz ${stateLabel(value.state)}${generation}${failures}${location}`),
      );

    if (target) {
      bar.cursor_pointer().on_click((_event, cx) => {
        const current = this.locations.unique(folder);
        if (current) run("pane.focus", { terminal: current.terminal });
        cx.notify();
      });
    }
    return bar;
  }
}
