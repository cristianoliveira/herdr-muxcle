import {
  captureMoveTarget,
  moveTabAction,
  moveToPosition,
  renameFromCwdAction,
  type MovePositionResult,
  type MoveTarget,
  type TabMoveAction,
  type TabToolAction,
  type TabToolFocus,
  type TabToolSpace,
} from "./model.js";

export interface TabToolsAdapter {
  spaces(): readonly TabToolSpace[];
  focused(): TabToolFocus | null;
  run(action: TabToolAction): void;
  openPosition(target: MoveTarget): void;
  notify(message: string, level: "info" | "error"): void;
}

export class TabToolsController {
  constructor(private readonly adapter: TabToolsAdapter) {}

  handle(command: string): void {
    switch (command) {
      case "move-left":
      case "move-right":
        this.move(command === "move-left" ? "left" : "right");
        return;
      case "move-position":
        this.openPosition();
        return;
      case "rename-from-cwd":
        this.renameFromCwd();
        return;
    }
  }

  private move(direction: "left" | "right"): void {
    const action = moveTabAction(this.adapter.spaces(), direction);
    if (action) this.dispatch(action, "Could not move that tab. Check its position and try again.");
  }

  private openPosition(): void {
    const target = captureMoveTarget(this.adapter.focused(), this.adapter.spaces());
    if (!target) {
      this.adapter.notify("Focus a tab in an open space before choosing its position.", "info");
      return;
    }
    this.adapter.openPosition(target);
  }

  private renameFromCwd(): void {
    const action = renameFromCwdAction(this.adapter.focused(), this.adapter.spaces());
    if (!action) {
      this.adapter.notify("Focus a terminal with a known folder to rename its tab.", "info");
      return;
    }
    this.dispatch(action, "Could not rename that tab. Check Herdr and try again.");
  }

  private dispatch(action: TabToolAction, message: string): void {
    try {
      this.adapter.run(action);
    } catch {
      this.adapter.notify(message, "error");
    }
  }
}

export interface MovePositionAdapter {
  spaces(): readonly TabToolSpace[];
  run(action: TabMoveAction): void;
  close(): void;
}

export class MovePositionController {
  private closed = false;

  constructor(
    private readonly target: MoveTarget,
    private readonly adapter: MovePositionAdapter,
  ) {}

  submit(input: string): MovePositionResult | { kind: "closed" } {
    if (this.closed) return { kind: "closed" };
    const result = moveToPosition(this.adapter.spaces(), this.target, input);
    if (result.kind === "refused") return result;

    if (result.kind === "move") {
      try {
        this.adapter.run(result.action);
      } catch {
        return {
          kind: "refused",
          message: "Could not send the move command. Check the tab position before retrying.",
        };
      }
    }

    this.dismiss();
    return result;
  }

  cancel(): boolean {
    if (this.closed) return false;
    this.dismiss();
    return true;
  }

  dispose(): void {
    this.closed = true;
  }

  private dismiss(): void {
    this.closed = true;
    this.adapter.close();
  }
}
