import { View, type AsyncContext } from "gpui-kit";
import { spaces, shared, setShared, nextCommand, run, notify } from "herdr";
import { observeHistory, previousAction, type HistoryState } from "./model.js";

const HISTORY_KEY = "muxcle-history.v1";

export default class MuxcleHistory extends View {
  private closed = false;

  init(_props: Record<string, unknown> | undefined, cx: AsyncContext): void {
    cx.spawn(async (taskCx) => {
      while (!this.closed) {
        const command = await nextCommand();
        taskCx.notify();
        if (this.closed) return;
        if (command !== "last-tab" && command !== "last-space") continue;

        const snapshot = spaces();
        const action = previousAction(command, this.observe(snapshot), snapshot);
        if (!action) {
          notify({
            title: command === "last-tab" ? "No previous tab in this space" : "No previous space",
            level: "info",
          });
          continue;
        }
        try {
          run(action.command, action.args);
        } catch {
          notify({ title: "Navigation failed", body: "Check Herdr and select the target directly.", level: "error" });
        }
      }
    });
  }

  render(): string {
    this.observe(spaces());
    return "";
  }

  close(): void {
    this.closed = true;
  }

  private observe(snapshot: ReturnType<typeof spaces>): HistoryState {
    const previous = shared(HISTORY_KEY);
    const next = observeHistory(previous, snapshot);
    if (JSON.stringify(previous) !== JSON.stringify(next)) setShared(HISTORY_KEY, next);
    return next;
  }
}
