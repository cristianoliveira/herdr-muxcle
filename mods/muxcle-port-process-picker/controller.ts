import {
  PortProcessPickerModel,
  sameLocalContext,
  type LocalContext,
  type LocalContextResult,
  type ProcessEvidence,
  type ProcessInventory,
  type SignalKind,
  type SignalOutcome,
} from "./model.js";

export interface PortProcessPickerAdapter {
  context(): LocalContextResult;
  scan(): Promise<ProcessInventory>;
  signal(signal: SignalKind, reviewed: readonly ProcessEvidence[]): Promise<SignalOutcome>;
}

export type ScanActionResult =
  | { kind: "ready"; count: number; warnings: number }
  | { kind: "unavailable"; message: string }
  | { kind: "cancelled" }
  | { kind: "ignored" };

export type SignalActionResult =
  | { kind: "completed"; outcome: Extract<SignalOutcome, { kind: "completed" }> }
  | { kind: "changed"; message: string }
  | { kind: "unknown"; message: string }
  | { kind: "ignored" };

export class PortProcessPickerController {
  readonly model = new PortProcessPickerModel();
  private generation = 0;
  private scanPending = false;
  private reviewedContext: LocalContext | null = null;

  constructor(private readonly adapter: PortProcessPickerAdapter) {}

  get busy(): boolean {
    return this.scanPending || this.model.phase === "signaling";
  }

  toggle(pid: number): boolean {
    if (this.busy) return false;
    return this.model.toggle(pid);
  }

  async scan(): Promise<ScanActionResult> {
    if (this.busy || this.model.phase !== "selecting") return { kind: "ignored" };
    this.model.clearInventory();
    this.reviewedContext = null;
    let captured: LocalContextResult;
    try {
      captured = this.adapter.context();
    } catch {
      return { kind: "unavailable", message: "Could not verify a local terminal context. No inventory was requested." };
    }
    if (captured.kind !== "local") return { kind: "unavailable", message: captured.message };

    const operation = ++this.generation;
    this.scanPending = true;
    try {
      const inventory = await this.adapter.scan();
      if (!this.isCurrent(operation)) return { kind: "cancelled" };
      let current: LocalContextResult;
      try {
        current = this.adapter.context();
      } catch {
        return {
          kind: "unavailable",
          message:
            "Could not recheck the local terminal context during inventory. Nothing was signaled; rescan from a known local terminal.",
        };
      }
      if (current.kind !== "local" || !sameLocalContext(captured.context, current.context)) {
        return {
          kind: "unavailable",
          message:
            "The local terminal context changed during inventory. Nothing was signaled; return to the same local context and rescan.",
        };
      }
      if (!this.model.setInventory(inventory)) return { kind: "ignored" };
      this.reviewedContext = captured.context;
      return { kind: "ready", count: inventory.processes.length, warnings: inventory.warnings.length };
    } catch (error) {
      if (!this.isCurrent(operation)) return { kind: "cancelled" };
      return { kind: "unavailable", message: errorMessage(error) };
    } finally {
      if (operation === this.generation) this.scanPending = false;
    }
  }

  review(): boolean {
    if (this.busy) return false;
    return this.model.startReview() !== null;
  }

  forceReview(): boolean {
    if (this.busy) return false;
    return this.model.startForceReview();
  }

  back(): boolean {
    if (this.busy) return false;
    return this.model.back();
  }

  async signal(signal: SignalKind): Promise<SignalActionResult> {
    if (this.busy) return { kind: "ignored" };
    const reviewed = this.model.startSignal(signal);
    if (!reviewed) return { kind: "ignored" };

    let current: LocalContextResult;
    try {
      current = this.adapter.context();
    } catch {
      current = { kind: "unavailable", message: "Could not verify local context." };
    }
    if (
      this.reviewedContext === null ||
      current.kind !== "local" ||
      !sameLocalContext(this.reviewedContext, current.context)
    ) {
      const message =
        "The local terminal context changed before signaling. No signal was sent; close and reopen the picker from the same local context.";
      this.model.finishSignal({ kind: "unknown", message });
      return { kind: "changed", message };
    }

    try {
      const outcome = await this.adapter.signal(signal, reviewed);
      if (!validOutcome(outcome, signal, reviewed)) {
        const message =
          "The helper returned an incomplete or mismatched result. Some signals may have been sent; do not retry until you rescan.";
        this.model.finishSignal({ kind: "unknown", message });
        return { kind: "unknown", message };
      }
      this.model.finishSignal(outcome);
      return { kind: "completed", outcome };
    } catch {
      const message =
        "The signal helper did not return a reliable result. Some signals may have been sent; do not retry until you rescan.";
      this.model.finishSignal({ kind: "unknown", message });
      return { kind: "unknown", message };
    }
  }

  cancel(): boolean {
    const cancelled = this.model.cancel();
    if (!cancelled) return false;
    this.generation += 1;
    this.scanPending = false;
    return true;
  }

  dispose(): void {
    this.cancel();
  }

  private isCurrent(operation: number): boolean {
    return this.generation === operation && this.model.phase === "selecting";
  }
}

function validOutcome(
  outcome: SignalOutcome,
  signal: SignalKind,
  reviewed: readonly ProcessEvidence[],
): outcome is Extract<SignalOutcome, { kind: "completed" }> {
  if (
    outcome.kind !== "completed" ||
    outcome.signal !== signal ||
    !Array.isArray(outcome.results) ||
    outcome.results.length !== reviewed.length
  )
    return false;
  const expected = new Set(reviewed.map(({ pid }) => pid));
  const seen = new Set<number>();
  for (const result of outcome.results) {
    if (!expected.has(result.pid) || seen.has(result.pid)) return false;
    if (!["sent", "stale", "gone", "denied", "failed"].includes(result.status)) return false;
    seen.add(result.pid);
  }
  return seen.size === expected.size;
}

function errorMessage(error: unknown): string {
  if (!(error instanceof Error)) return "Could not inspect local listeners. Verify Python 3 and lsof, then rescan.";
  const message = error.message.replace(/[\u0000-\u001f\u007f]/gu, " ").slice(0, 512);
  return `Could not inspect local listeners: ${message}. Verify Python 3 and lsof, then rescan.`;
}
