import {
  SpaceCloserModel,
  captureReview,
  reviewStillMatches,
  type CoreMachineInfo,
  type LiveSpaceState,
  type SpaceInfo,
} from "./model.js";

export interface SpaceCloserAdapter {
  spaces(): readonly SpaceInfo[];
  machines(): LiveSpaceState["layouts"];
  coreMachines(): Promise<readonly CoreMachineInfo[]>;
  closeSpace(id: string): void;
}

export type ReviewActionResult =
  | { kind: "ready" }
  | { kind: "empty" }
  | { kind: "missing" }
  | { kind: "unavailable"; message: string }
  | { kind: "ignored" }
  | { kind: "cancelled" };

export type ConfirmActionResult =
  | { kind: "submitted"; attempted: number; dispatchErrors: number; completion: "unknown" }
  | { kind: "changed"; attempted: 0 }
  | { kind: "unavailable"; message: string }
  | { kind: "ignored" }
  | { kind: "cancelled" };

export class SpaceCloserController {
  readonly model = new SpaceCloserModel();
  private generation = 0;

  constructor(private readonly adapter: SpaceCloserAdapter) {}

  get phase() {
    return this.model.phase;
  }

  get selectedIds() {
    return this.model.selectedIds;
  }

  get reviewSnapshot() {
    return this.model.review;
  }

  get outcome() {
    return this.model.outcome;
  }

  spaces(): readonly SpaceInfo[] {
    return this.adapter.spaces();
  }

  toggle(id: string): boolean {
    return this.model.toggle(id, this.adapter.spaces());
  }

  async review(): Promise<ReviewActionResult> {
    if (!this.model.startReview()) {
      return this.model.phase === "selecting" && this.model.selectedIds.size === 0
        ? { kind: "empty" }
        : { kind: "ignored" };
    }

    const operation = ++this.generation;
    const selected = [...this.model.selectedIds];
    try {
      const peers = this.needsRemoteIdentity(selected, this.adapter.spaces())
        ? await this.adapter.coreMachines()
        : null;
      if (!this.isCurrent(operation, "checking-review")) return { kind: "cancelled" };

      const spaces = this.adapter.spaces();
      const captured = captureReview(spaces, selected, this.adapter.machines(), peers);
      this.model.acceptReview(captured);
      if (captured.kind === "ready") return { kind: "ready" };
      if (captured.kind === "empty") return { kind: "empty" };
      if (captured.kind === "missing") return { kind: "missing" };
      return { kind: "unavailable", message: captured.message };
    } catch {
      if (!this.isCurrent(operation, "checking-review")) return { kind: "cancelled" };
      this.model.failReview();
      return { kind: "unavailable", message: "Could not verify the selected spaces. Nothing was closed." };
    }
  }

  back(): boolean {
    if (!this.model.back()) return false;
    this.generation += 1;
    return true;
  }

  async confirm(): Promise<ConfirmActionResult> {
    const review = this.model.startConfirm();
    if (!review) return { kind: "ignored" };

    const operation = ++this.generation;
    try {
      const peers = review.some((space) => space.machine !== null) ? await this.adapter.coreMachines() : null;
      if (!this.isCurrent(operation, "checking-confirm")) return { kind: "cancelled" };

      const spaces = this.adapter.spaces();
      const liveState: LiveSpaceState = {
        spaces,
        layouts: this.adapter.machines(),
        peers,
      };
      if (!reviewStillMatches(review, liveState)) {
        this.model.invalidateReview(spaces);
        return { kind: "changed", attempted: 0 };
      }

      let attempted = 0;
      let dispatchErrors = 0;
      for (const space of review) {
        attempted += 1;
        try {
          this.adapter.closeSpace(space.id);
        } catch {
          dispatchErrors += 1;
        }
      }
      const outcome = { attempted, dispatchErrors, completion: "unknown" as const };
      this.model.submit(outcome);
      return { kind: "submitted", ...outcome };
    } catch {
      if (!this.isCurrent(operation, "checking-confirm")) return { kind: "cancelled" };
      this.model.restoreReview();
      return { kind: "unavailable", message: "Could not revalidate the reviewed spaces. No close command was sent." };
    }
  }

  cancel(): boolean {
    if (!this.model.cancel()) return false;
    this.generation += 1;
    return true;
  }

  dispose(): void {
    this.cancel();
  }

  private needsRemoteIdentity(ids: readonly string[], spaces: readonly SpaceInfo[]): boolean {
    return spaces.some((space) => ids.includes(space.id) && space.machine !== null);
  }

  private isCurrent(operation: number, phase: "checking-review" | "checking-confirm"): boolean {
    return this.generation === operation && this.model.phase === phase;
  }
}
