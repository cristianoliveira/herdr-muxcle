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

export type SizingPlan =
  | { kind: "document"; context: DocumentSizingContext }
  | { kind: "noop" }
  | { kind: "unsupported"; message: string };

export function sizingPlan(
  focus: SizingFocus | null,
  tab: SizingTab | undefined,
  allPanes: readonly SizingPane[],
  machine: string | null = null,
): SizingPlan {
  if (!focus?.pane || !focus.terminal || focus.shown !== null) {
    return { kind: "unsupported", message: "Focus an ordinary terminal pane before equalizing." };
  }
  if (!tab || tab.id !== focus.tab) {
    return { kind: "unsupported", message: "The focused tab is unavailable. Select it again before equalizing." };
  }

  const panes = allPanes.filter((pane) => pane.tab === focus.tab);
  const ids = panes.map((pane) => pane.pane);
  const current = panes.find((pane) => pane.pane === focus.pane);
  if (panes.length !== tab.panes || new Set(ids).size !== ids.length || current?.terminal !== focus.terminal) {
    return { kind: "unsupported", message: "The pane layout is not ready. Wait for it to settle before equalizing." };
  }
  if (tab.zoomed || panes.some((pane) => pane.zoomed || !pane.terminal || pane.mod)) {
    return { kind: "unsupported", message: "Unzoom the tab and use ordinary terminal panes before equalizing." };
  }
  if (panes.length === 1) return { kind: "noop" };
  if (panes.length > 64) {
    return { kind: "unsupported", message: "Equalizing supports at most 64 panes in one tab." };
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
