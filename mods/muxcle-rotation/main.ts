import { View, type AsyncContext } from "gpui-kit";
import { focused, spaces, panes, nextCommand, run, notify } from "herdr";
import { rotationPlan } from "./model.js";

export default class MuxcleRotation extends View {
  private closed = false;

  init(_props: Record<string, unknown> | undefined, cx: AsyncContext): void {
    cx.spawn(async (taskCx) => {
      while (!this.closed) {
        const command = await nextCommand();
        taskCx.notify();
        if (this.closed) return;
        if (command !== "rotate") continue;

        const focus = focused();
        const tab = spaces()
          .find((space) => space.id === focus?.space)
          ?.tabs.find((item) => item.id === focus?.tab);
        const plan = rotationPlan(focus, tab, panes());
        if (plan.kind === "noop") continue;
        if (plan.kind === "unsupported") {
          notify({ title: "Pane rotation unavailable", body: plan.message, level: "info" });
          continue;
        }
        try {
          for (const action of plan.actions) run(action.command, action.args);
        } catch {
          notify({
            title: "Pane rotation stopped",
            body: "Some commands may have applied. Check pane positions before trying again.",
            level: "error",
          });
        }
      }
    });
  }

  render(): string {
    return "";
  }

  close(): void {
    this.closed = true;
  }
}
