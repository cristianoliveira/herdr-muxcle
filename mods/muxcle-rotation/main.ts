import { View, type AsyncContext } from "gpui-kit";
import { focused, spaces, panes, nextCommand, run, notify, exec, appHome } from "herdr";
import { RotationController } from "./controller.js";
import { executeDocumentRotation } from "./adapter.js";
import { nativePairRotationEnabled } from "./model.js";

export default class MuxcleRotation extends View {
  private closed = false;
  private controller!: RotationController;

  init(props: Record<string, unknown> | undefined, cx: AsyncContext): void {
    this.controller = new RotationController(
      {
        snapshot: () => {
          const focus = focused();
          const space = spaces().find((item) => item.id === focus?.space);
          return {
            focus,
            tab: space?.tabs.find((item) => item.id === focus?.tab),
            panes: panes(),
            machine: space?.machine ?? null,
          };
        },
        document: (context) =>
          executeDocumentRotation(exec, `${appHome().replace(/[\\/]+$/, "")}/mods/muxcle-rotation`, context),
        run: (action) => {
          run(action.command, action.args);
        },
        notice: (message, level) => {
          notify({ title: "Pane rotation", body: message, level });
        },
      },
      nativePairRotationEnabled(props),
    );
    cx.spawn(async (taskCx) => {
      while (!this.closed) {
        const command = await nextCommand();
        taskCx.notify();
        if (this.closed) return;
        if (command !== "rotate") continue;
        taskCx.spawn(async (operationCx) => {
          await this.controller.rotate();
          if (!this.closed) operationCx.notify();
        });
      }
    });
  }

  render(): string {
    return "";
  }

  close(): void {
    this.closed = true;
    this.controller?.dispose();
  }
}
