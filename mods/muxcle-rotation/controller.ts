import {
  rotationPlan,
  type DocumentRotationContext,
  type RotationAction,
  type RotationFocus,
  type RotationPane,
  type RotationTab,
} from "./model.js";

export interface RotationSnapshot {
  focus: RotationFocus | null;
  tab: RotationTab | undefined;
  panes: readonly RotationPane[];
  machine: string | null;
}

export interface RotationAdapter {
  snapshot(): RotationSnapshot;
  document(context: DocumentRotationContext): Promise<string>;
  run(action: RotationAction): void;
  notice(message: string, level: "info" | "error"): void;
}

export class RotationController {
  private busy = false;
  private closed = false;

  constructor(private readonly adapter: RotationAdapter) {}

  async rotate(): Promise<boolean> {
    if (this.busy || this.closed) return false;
    this.busy = true;
    try {
      const before = this.adapter.snapshot();
      const plan = rotationPlan(before.focus, before.tab, before.panes, before.machine);
      if (plan.kind === "noop") return false;
      if (plan.kind === "unsupported") {
        this.adapter.notice(plan.message, "info");
        return false;
      }
      if (plan.kind === "rotate") {
        for (const action of plan.actions) this.adapter.run(action);
        return true;
      }

      const raw = await this.adapter.document(plan.context);
      confirmResult(raw, plan.focusTarget);
      if (this.closed) return true;
      if (canRestoreFocus(before, this.adapter.snapshot(), plan.context)) {
        this.adapter.run({ command: "pane.focus", args: { pane: plan.focusTarget } });
      }
      return true;
    } catch (error) {
      if (!this.closed) {
        const message = error instanceof Error ? error.message : "Rotation could not be confirmed.";
        this.adapter.notice(`${message} Inspect pane positions before repeating.`, "error");
      }
      return false;
    } finally {
      this.busy = false;
    }
  }

  dispose(): void {
    this.closed = true;
  }
}

function confirmResult(raw: string, expectedPane: string): void {
  if (raw.length > 8_192) throw new Error("Rotation helper returned too much data; outcome is uncertain.");
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    throw new Error("Rotation helper returned invalid data; outcome is uncertain.");
  }
  if (
    value === null ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    !("changed" in value) ||
    value.changed !== true ||
    !("pane" in value) ||
    value.pane !== expectedPane
  ) {
    throw new Error("Rotation helper returned an unexpected result; outcome is uncertain.");
  }
}

function canRestoreFocus(before: RotationSnapshot, after: RotationSnapshot, context: DocumentRotationContext): boolean {
  const previous = before.focus;
  const current = after.focus;
  if (
    !previous ||
    !current ||
    current.space !== previous.space ||
    current.tab !== previous.tab ||
    current.pane !== previous.pane ||
    current.terminal !== previous.terminal ||
    current.shown !== previous.shown ||
    after.machine !== context.machine ||
    after.tab?.id !== context.tab ||
    after.tab.zoomed ||
    after.tab.panes !== context.panes.length
  )
    return false;

  const panes = after.panes.filter((pane) => pane.tab === context.tab);
  if (
    panes.length !== context.panes.length ||
    panes.some(
      (pane) => pane.mod || pane.zoomed || pane.terminal !== context.terminals[context.panes.indexOf(pane.pane)],
    )
  )
    return false;
  const ids = panes.map((pane) => pane.pane);
  const rotated = [context.panes[context.panes.length - 1], ...context.panes.slice(0, -1)];
  return ids.every((id, index) => id === context.panes[index]) || ids.every((id, index) => id === rotated[index]);
}
