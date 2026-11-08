export interface RotationFocus {
  space: string;
  tab: string;
  pane: string | null;
  terminal: string | null;
  shown: string | null;
}

export interface RotationPane {
  pane: string;
  terminal: string | null;
  mod?: string;
  tab: string;
  zoomed: boolean;
}

export interface RotationTab {
  id: string;
  panes: number;
  zoomed: boolean;
}

export type RotationAction =
  | { command: "pane.swap"; args: { direction: "left" | "right" | "up" | "down" } }
  | { command: "pane.focus"; args: { pane: string } };

export type RotationPlan =
  | { kind: "rotate"; actions: RotationAction[] }
  | { kind: "noop" }
  | { kind: "unsupported"; message: string };

export function rotationPlan(
  focus: RotationFocus | null,
  tab: RotationTab | undefined,
  allPanes: readonly RotationPane[],
): RotationPlan {
  if (!focus?.pane || !focus.terminal || focus.shown !== null) {
    return { kind: "unsupported", message: "Focus an ordinary terminal pane before rotating." };
  }
  if (!tab || tab.id !== focus.tab) {
    return { kind: "unsupported", message: "The focused tab is unavailable. Select it again before rotating." };
  }

  const panes = allPanes.filter((pane) => pane.tab === focus.tab);
  const ids = panes.map((pane) => pane.pane);
  const current = panes.find((pane) => pane.pane === focus.pane);
  if (panes.length !== tab.panes || new Set(ids).size !== ids.length || current?.terminal !== focus.terminal) {
    return { kind: "unsupported", message: "The pane layout is not ready. Wait for it to settle before rotating." };
  }
  if (tab.zoomed || panes.some((pane) => pane.zoomed || !pane.terminal || pane.mod)) {
    return { kind: "unsupported", message: "Unzoom the tab and use ordinary terminal panes before rotating." };
  }
  if (panes.length === 1) return { kind: "noop" };
  if (panes.length !== 2) {
    return {
      kind: "unsupported",
      message: "This native rotation supports exactly two panes; larger layouts are unchanged.",
    };
  }

  const first = focus.pane === ids[0];
  const directions = first ? (["right", "down"] as const) : (["left", "up"] as const);
  return {
    kind: "rotate",
    actions: [
      ...directions.map((direction): RotationAction => ({ command: "pane.swap", args: { direction } })),
      { command: "pane.focus", args: { pane: first ? ids[1] : ids[0] } },
    ],
  };
}
