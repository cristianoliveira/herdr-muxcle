export type MachineLayout = "loading" | "ready" | "unavailable";

export interface SpaceTab {
  id: string;
  name: string;
  panes: number;
}

export interface SpaceInfo {
  id: string;
  name: string;
  folder: string;
  machine: string | null;
  tabs: readonly SpaceTab[];
}

export interface MachineLayoutInfo {
  name: string | null;
  layout: MachineLayout;
}

export interface CoreMachineInfo {
  id: string;
  name: string;
  state: string;
  temporary?: boolean;
}

export interface ReviewedSpace extends SpaceInfo {
  peerId: string;
}

export interface LiveSpaceState {
  spaces: readonly SpaceInfo[];
  layouts: readonly MachineLayoutInfo[];
  peers: readonly CoreMachineInfo[] | null;
}

export type CaptureReviewResult =
  | { kind: "ready"; review: readonly ReviewedSpace[] }
  | { kind: "empty" }
  | { kind: "missing"; missingIds: readonly string[] }
  | { kind: "unavailable"; message: string };

export type CloserPhase =
  | "selecting"
  | "checking-review"
  | "reviewing"
  | "checking-confirm"
  | "submitted"
  | "cancelled";

export type CloserKeyAction = "cancel" | "ignore" | "pass";

export interface SubmissionOutcome {
  attempted: number;
  dispatchErrors: number;
  completion: "unknown";
}

const LOCAL_PEER_ID = "local";

export function closerKeyAction(phase: CloserPhase, ...keys: string[]): CloserKeyAction {
  const pressed = keys.map((key) => key.toLowerCase());
  if (pressed.some((key) => key === "escape" || key === "esc")) return "cancel";
  if (phase !== "selecting" && pressed.some((key) => key.includes("enter") || key.includes("return"))) {
    return "ignore";
  }
  return "pass";
}

export function filterSpaces(spaces: readonly SpaceInfo[], query: string): SpaceInfo[] {
  const words = query.toLowerCase().trim().split(/\s+/u).filter(Boolean);
  if (words.length === 0) return [...spaces];
  return spaces.filter((space) => {
    const label = `${space.name} ${space.machine ?? "local"} ${space.folder}`.toLowerCase();
    return words.every((word) => label.includes(word));
  });
}

export function captureReview(
  spaces: readonly SpaceInfo[],
  selectedIds: readonly string[],
  layouts: readonly MachineLayoutInfo[],
  peers: readonly CoreMachineInfo[] | null,
): CaptureReviewResult {
  if (selectedIds.length === 0) return { kind: "empty" };

  const selected = new Set(selectedIds);
  if (selected.size !== selectedIds.length || [...selected].some((id) => !validText(id, 512))) {
    return { kind: "unavailable", message: "The selected spaces could not be verified. Nothing was closed." };
  }

  const counts = new Map<string, number>();
  for (const space of spaces) counts.set(space.id, (counts.get(space.id) ?? 0) + 1);
  if ([...selected].some((id) => (counts.get(id) ?? 0) > 1)) {
    return { kind: "unavailable", message: "A selected space ID is ambiguous. Nothing was closed." };
  }
  const missingIds = [...selected].filter((id) => !counts.has(id));
  if (missingIds.length > 0) return { kind: "missing", missingIds };

  const review: ReviewedSpace[] = [];
  for (const id of selectedIds) {
    const space = spaces.find((candidate) => candidate.id === id)!;
    const validationError = validateSpace(space);
    if (validationError) return { kind: "unavailable", message: validationError };

    const layoutMatches = layouts.filter((machine) => machine.name === space.machine);
    if (layoutMatches.length !== 1 || layoutMatches[0].layout !== "ready") {
      return { kind: "unavailable", message: machineUnavailableMessage(space.machine) };
    }

    let peerId = LOCAL_PEER_ID;
    if (space.machine !== null) {
      if (peers === null) {
        return { kind: "unavailable", message: "The remote Core identity is unavailable. Nothing was closed." };
      }
      const peerMatches = peers.filter((peer) => peer.name === space.machine);
      if (peerMatches.length !== 1 || peerMatches[0].state !== "connected" || !validText(peerMatches[0].id, 512)) {
        return { kind: "unavailable", message: machineUnavailableMessage(space.machine) };
      }
      peerId = peerMatches[0].id;
    }

    review.push(
      freezeReview({
        id: space.id,
        name: space.name,
        folder: space.folder,
        machine: space.machine,
        peerId,
        tabs: space.tabs.map(({ id: tabId, name, panes }) => ({ id: tabId, name, panes })),
      }),
    );
  }

  return { kind: "ready", review: Object.freeze(review) };
}

export function reviewStillMatches(review: readonly ReviewedSpace[], state: LiveSpaceState): boolean {
  if (review.length === 0) return false;
  const current = captureReview(
    state.spaces,
    review.map((space) => space.id),
    state.layouts,
    state.peers,
  );
  return current.kind === "ready" && JSON.stringify(current.review) === JSON.stringify(review);
}

export class SpaceCloserModel {
  private currentPhase: CloserPhase = "selecting";
  private chosen = new Set<string>();
  private captured: readonly ReviewedSpace[] | null = null;
  private result: SubmissionOutcome | null = null;

  get phase(): CloserPhase {
    return this.currentPhase;
  }

  get selectedIds(): ReadonlySet<string> {
    return new Set(this.chosen);
  }

  get review(): readonly ReviewedSpace[] | null {
    return this.captured;
  }

  get outcome(): SubmissionOutcome | null {
    return this.result;
  }

  toggle(id: string, spaces: readonly SpaceInfo[]): boolean {
    if (this.currentPhase !== "selecting" || !validText(id, 512)) return false;
    if (this.chosen.has(id)) {
      this.chosen.delete(id);
      return true;
    }
    if (spaces.filter((space) => space.id === id).length !== 1) return false;
    this.chosen.add(id);
    return true;
  }

  startReview(): boolean {
    if (this.currentPhase !== "selecting" || this.chosen.size === 0) return false;
    this.currentPhase = "checking-review";
    return true;
  }

  acceptReview(result: CaptureReviewResult): void {
    if (this.currentPhase !== "checking-review") return;
    if (result.kind === "ready") {
      this.captured = result.review;
      this.currentPhase = "reviewing";
      return;
    }
    if (result.kind === "missing") {
      for (const id of result.missingIds) this.chosen.delete(id);
    }
    this.captured = null;
    this.currentPhase = "selecting";
  }

  failReview(): void {
    if (this.currentPhase !== "checking-review") return;
    this.currentPhase = "selecting";
    this.captured = null;
  }

  startConfirm(): readonly ReviewedSpace[] | null {
    if (this.currentPhase !== "reviewing" || this.captured === null) return null;
    this.currentPhase = "checking-confirm";
    return this.captured;
  }

  restoreReview(): void {
    if (this.currentPhase === "checking-confirm") this.currentPhase = "reviewing";
  }

  invalidateReview(spaces: readonly SpaceInfo[]): void {
    if (this.currentPhase !== "checking-confirm") return;
    const liveCounts = new Map<string, number>();
    for (const space of spaces) liveCounts.set(space.id, (liveCounts.get(space.id) ?? 0) + 1);
    this.chosen = new Set([...this.chosen].filter((id) => liveCounts.get(id) === 1));
    this.captured = null;
    this.currentPhase = "selecting";
  }

  back(): boolean {
    if (this.currentPhase !== "reviewing") return false;
    this.captured = null;
    this.currentPhase = "selecting";
    return true;
  }

  submit(outcome: SubmissionOutcome): void {
    if (this.currentPhase !== "checking-confirm") return;
    this.result = outcome;
    this.currentPhase = "submitted";
  }

  cancel(): boolean {
    if (this.currentPhase === "submitted" || this.currentPhase === "cancelled") return false;
    this.currentPhase = "cancelled";
    this.chosen.clear();
    this.captured = null;
    return true;
  }
}

function validateSpace(space: SpaceInfo): string | null {
  if (
    !space ||
    !validText(space.id, 512) ||
    !validText(space.name, 1_024) ||
    typeof space.folder !== "string" ||
    space.folder.length > 4_096 ||
    /[\u0000-\u001f\u007f]/u.test(space.folder) ||
    (space.machine !== null && !validText(space.machine, 256)) ||
    !Array.isArray(space.tabs)
  ) {
    return "A selected space has incomplete native data. Nothing was closed.";
  }
  const tabIds = new Set<string>();
  for (const tab of space.tabs) {
    if (
      !validText(tab.id, 512) ||
      !validText(tab.name, 1_024) ||
      !Number.isSafeInteger(tab.panes) ||
      tab.panes < 0 ||
      tabIds.has(tab.id)
    ) {
      return "A selected space has an invalid tab snapshot. Nothing was closed.";
    }
    tabIds.add(tab.id);
  }
  return null;
}

function freezeReview(space: ReviewedSpace): ReviewedSpace {
  for (const tab of space.tabs) Object.freeze(tab);
  Object.freeze(space.tabs);
  return Object.freeze(space);
}

function validText(value: unknown, maximum: number): value is string {
  return (
    typeof value === "string" && value.length > 0 && value.length <= maximum && !/[\u0000-\u001f\u007f]/u.test(value)
  );
}

function machineUnavailableMessage(machine: string | null): string {
  const label = machine === null ? "This computer" : `Machine ${machine}`;
  return `${label} is not ready with the same Core identity. Nothing was closed.`;
}
