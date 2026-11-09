export const SIZING_OPERATIONS = [
  "equalize",
  "grow-width",
  "shrink-width",
  "grow-height",
  "shrink-height",
  "strip-height",
] as const;

export type SizingOperation = (typeof SIZING_OPERATIONS)[number];

export function isSizingOperation(value: string): value is SizingOperation {
  return (SIZING_OPERATIONS as readonly string[]).includes(value);
}

export interface SizingFocus {
  space: string;
  tab: string;
  pane: string | null;
  terminal: string | null;
  shown: string | null;
}

export interface SizingPane {
  pane: string;
  terminal: string | null;
  mod?: string;
  tab: string;
  zoomed: boolean;
}

export interface SizingTab {
  id: string;
  panes: number;
  zoomed: boolean;
}

export interface DocumentSizingContext {
  space: string;
  tab: string;
  pane: string;
  panes: string[];
  terminals: string[];
  machine: string | null;
}

export interface SizingSnapshot {
  focus: SizingFocus | null;
  tab: SizingTab | undefined;
  panes: readonly SizingPane[];
  machine: string | null;
}

export type SizingPlan =
  | { kind: "document"; context: DocumentSizingContext }
  | { kind: "noop" }
  | { kind: "unsupported"; message: string };

export function sizingPlan(
  focus: SizingFocus | null,
  tab: SizingTab | undefined,
  allPanes: readonly SizingPane[],
  machine: string | null = null,
  operation: SizingOperation = "equalize",
): SizingPlan {
  if (!focus?.pane || !focus.terminal || focus.shown !== null) {
    return { kind: "unsupported", message: "Focus an ordinary terminal pane before changing pane sizes." };
  }
  if (!tab || tab.id !== focus.tab) {
    return {
      kind: "unsupported",
      message: "The focused tab is unavailable. Select it again before changing pane sizes.",
    };
  }

  const panes = allPanes.filter((pane) => pane.tab === focus.tab);
  const ids = panes.map((pane) => pane.pane);
  const current = panes.find((pane) => pane.pane === focus.pane);
  if (panes.length !== tab.panes || new Set(ids).size !== ids.length || current?.terminal !== focus.terminal) {
    return {
      kind: "unsupported",
      message: "The pane layout is not ready. Wait for it to settle before changing pane sizes.",
    };
  }
  const stripHeight = operation === "strip-height";
  if (
    (!stripHeight && tab.zoomed) ||
    panes.some((pane) => (!stripHeight && pane.zoomed) || !pane.terminal || pane.mod)
  ) {
    return {
      kind: "unsupported",
      message: "Unzoom the tab and use ordinary terminal panes before changing pane sizes.",
    };
  }
  if (panes.length === 1) return { kind: "noop" };
  if (stripHeight && panes.length > 25) {
    return { kind: "unsupported", message: "A 4% height strip supports at most 25 panes in one tab." };
  }
  if (panes.length > 64) {
    return { kind: "unsupported", message: "Pane sizing supports at most 64 panes in one tab." };
  }

  return {
    kind: "document",
    context: {
      space: focus.space,
      tab: focus.tab,
      pane: focus.pane,
      panes: ids,
      terminals: panes.map((pane) => pane.terminal ?? ""),
      machine,
    },
  };
}

export function canUnzoomStrip(before: SizingSnapshot, after: SizingSnapshot): boolean {
  const focus = before.focus;
  return Boolean(
    before.tab?.zoomed &&
      focus?.pane &&
      focus.shown === null &&
      before.tab.id === focus.tab &&
      before.machine === after.machine &&
      after.tab?.id === focus.tab &&
      after.tab.zoomed &&
      after.focus?.space === focus.space &&
      after.focus.tab === focus.tab &&
      after.focus.pane === focus.pane &&
      after.focus.terminal === focus.terminal &&
      after.focus.shown === focus.shown &&
      before.panes.some(
        (pane) => pane.pane === focus.pane && pane.tab === focus.tab && pane.terminal === focus.terminal && pane.zoomed,
      ) &&
      after.panes.some(
        (pane) => pane.pane === focus.pane && pane.tab === focus.tab && pane.terminal === focus.terminal && pane.zoomed,
      ),
  );
}
