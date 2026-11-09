import { View, type AsyncContext } from "gpui-kit";
import { appHome, exec, focused, nextCommand, notify, panes, spaces } from "herdr";
import { executeDocumentEqualization } from "./adapter.js";
import { SizingController } from "./controller.js";
import { isSizingOperation } from "./model.js";

const MOD_NAME = "muxcle-sizing";

export default class MuxcleSizing extends View {
  private closed = false;
  private controller!: SizingController;

  init(_props: Record<string, unknown> | undefined, cx: AsyncContext): void {
    this.controller = new SizingController({
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
      document: (context, operation) =>
        executeDocumentEqualization(exec, `${appHome().replace(/[\\/]+$/, "")}/mods/${MOD_NAME}`, context, operation),
      notice: (message, level) => notify({ title: "Pane sizing", body: message, level }),
    });

    cx.spawn(async (hostCx) => {
      while (!this.closed) {
        const command = await nextCommand();
        hostCx.notify();
        if (this.closed) return;
        if (command !== "help" && !isSizingOperation(command)) continue;
        hostCx.spawn(async (operationCx) => {
          await this.controller.execute(command);
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
