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

export function nativePairRotationEnabled(props: unknown): boolean {
  if (props === null || typeof props !== "object" || Array.isArray(props)) return true;
  const values = props as Record<string, unknown>;
  return (values.native_rotation ?? values.native_pair_rotation) !== false;
}

export type RotationAction =
  | { command: "pane.swap"; args: { direction: "left" | "right" | "up" | "down" } }
  | { command: "pane.focus"; args: { pane: string } };

export interface DocumentRotationContext {
  space: string;
  tab: string;
  pane: string;
  panes: string[];
  terminals: string[];
  machine: string | null;
}

export type RotationPlan =
  | { kind: "rotate"; actions: RotationAction[] }
  | { kind: "document"; context: DocumentRotationContext; focusTarget: string }
  | { kind: "noop" }
  | { kind: "unsupported"; message: string };

export function rotationPlan(
  focus: RotationFocus | null,
  tab: RotationTab | undefined,
  allPanes: readonly RotationPane[],
  machine: string | null = null,
  nativePairRotation = true,
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
  if (panes.length > 64) {
    return { kind: "unsupported", message: "Rotation supports at most 64 panes in one tab." };
  }
  if (panes.length > 2 || !nativePairRotation) {
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
      focusTarget: ids[(ids.indexOf(focus.pane) + ids.length - 1) % ids.length],
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
