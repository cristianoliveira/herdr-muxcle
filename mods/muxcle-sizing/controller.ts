import {
  isSizingOperation,
  SIZING_HELP_MESSAGE,
  sizingPlan,
  type DocumentSizingContext,
  type SizingFocus,
  type SizingOperation,
  type SizingPane,
  type SizingTab,
} from "./model.js";

export interface SizingSnapshot {
  focus: SizingFocus | null;
  tab: SizingTab | undefined;
  panes: readonly SizingPane[];
  machine: string | null;
}

export interface SizingAdapter {
  snapshot(): SizingSnapshot;
  document(context: DocumentSizingContext, operation: SizingOperation): Promise<string>;
  notice(message: string, level: "info" | "error"): void;
}

export class SizingController {
  private busy = false;
  private closed = false;

  constructor(private readonly adapter: SizingAdapter) {}

  equalize(): Promise<boolean> {
    return this.execute("equalize");
  }

  async execute(operation: string): Promise<boolean> {
    if (this.closed) return false;
    if (operation === "help") {
      this.adapter.notice(SIZING_HELP_MESSAGE, "info");
      return false;
    }
    if (!isSizingOperation(operation)) return false;
    if (this.busy) return false;
    this.busy = true;
    try {
      const snapshot = this.adapter.snapshot();
      const plan = sizingPlan(snapshot.focus, snapshot.tab, snapshot.panes, snapshot.machine);
      if (plan.kind === "noop") return false;
      if (plan.kind === "unsupported") {
        this.adapter.notice(plan.message, "info");
        return false;
      }

      const result = parseResult(await this.adapter.document(plan.context, operation), operation);
      if (!result.changed) return false;
      if (!this.closed) this.adapter.notice(successMessage(operation, result.splits), "info");
      return true;
    } catch (error) {
      if (!this.closed) {
        const message = error instanceof Error ? error.message : "Equalizing could not be confirmed.";
        this.adapter.notice(message, "error");
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

function successMessage(operation: SizingOperation, splits: number): string {
  if (operation === "equalize") {
    const splitLabel = splits === 1 ? "split" : "splits";
    return `Equalized ${splits} ${splitLabel}.`;
  }
  const direction = operation.startsWith("grow-") ? "Grew" : "Shrunk";
  const axis = operation.endsWith("width") ? "width" : "height";
  return `${direction} pane ${axis}.`;
}

interface EqualizationResult {
  changed: boolean;
  splits: number;
}

function parseResult(raw: string, operation: SizingOperation): EqualizationResult {
  if (raw.length > 8_192) throw new Error("Sizing helper returned too much data; outcome may be uncertain.");
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    throw new Error("Sizing helper returned invalid data; outcome may be uncertain.");
  }
  if (
    value === null ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    !("changed" in value) ||
    typeof value.changed !== "boolean" ||
    !("splits" in value) ||
    typeof value.splits !== "number" ||
    !Number.isInteger(value.splits) ||
    value.splits < 0 ||
    value.splits > 512 ||
    value.changed !== value.splits > 0
  ) {
    throw new Error("Sizing helper returned an unexpected result; outcome may be uncertain.");
  }
  if (operation !== "equalize" && value.splits > 1) {
    throw new Error("Sizing helper returned an unexpected resize result; outcome may be uncertain.");
  }
  return { changed: value.changed, splits: value.splits };
}
