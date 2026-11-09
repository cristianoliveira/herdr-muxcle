export interface TabToolTab {
  id: string;
  active: boolean;
}

export interface TabToolSpace {
  id: string;
  active: boolean;
  tabs: readonly TabToolTab[];
}

export interface TabToolFocus {
  space: string | null;
  tab: string | null;
  pane: string | null;
  terminal: string | null;
  shown: string | null;
  cwd: string | null;
}

export interface MoveTarget {
  spaceId: string;
  tabId: string;
}

export interface TabMoveAction {
  command: "tab.move";
  args: { id: string; index: number };
}

export interface TabRenameAction {
  command: "tab.rename";
  args: { id: string; name: string };
}

export type TabToolAction = TabMoveAction | TabRenameAction;

export type MovePositionResult =
  | { kind: "move"; action: TabMoveAction }
  | { kind: "unchanged" }
  | { kind: "refused"; message: string };

const MAX_POSITION_DIGITS = 16;

export function moveTabAction(spaces: readonly TabToolSpace[], direction: "left" | "right"): TabMoveAction | null {
  const space = spaces.find((candidate) => candidate.active);
  const index = space?.tabs.findIndex((tab) => tab.active) ?? -1;
  if (!space || index < 0) return null;

  const targetIndex = index + (direction === "left" ? -1 : 1);
  if (targetIndex < 0 || targetIndex >= space.tabs.length) return null;

  return {
    command: "tab.move",
    args: { id: space.tabs[index].id, index: targetIndex + 1 },
  };
}

export function captureMoveTarget(focus: TabToolFocus | null, spaces: readonly TabToolSpace[]): MoveTarget | null {
  if (!focus?.space || !focus.tab) return null;
  const space = spaces.find((candidate) => candidate.id === focus.space);
  if (!space?.tabs.some((tab) => tab.id === focus.tab)) return null;
  return { spaceId: focus.space, tabId: focus.tab };
}

export function positionMaximum(spaces: readonly TabToolSpace[], target: MoveTarget): number | null {
  const space = matchingSpace(spaces, target);
  return space ? space.tabs.length - 1 : null;
}

export function moveToPosition(spaces: readonly TabToolSpace[], target: MoveTarget, input: string): MovePositionResult {
  const space = matchingSpace(spaces, target);
  if (!space) return { kind: "refused", message: "That tab is no longer in its original space." };

  const maximum = space.tabs.length - 1;
  if (input.length === 0 || input.length > MAX_POSITION_DIGITS || !/^\d+$/u.test(input)) {
    return { kind: "refused", message: `Enter a whole number from 0 to ${maximum}.` };
  }

  const position = Number(input);
  if (!Number.isSafeInteger(position) || position < 0 || position > maximum) {
    return { kind: "refused", message: `Enter a whole number from 0 to ${maximum}.` };
  }

  const currentIndex = space.tabs.findIndex((tab) => tab.id === target.tabId);
  if (currentIndex === position) return { kind: "unchanged" };
  return {
    kind: "move",
    action: { command: "tab.move", args: { id: target.tabId, index: position + 1 } },
  };
}

export function folderTabName(cwd: string | null): string | null {
  if (cwd === null || cwd.length === 0) return null;
  const withoutTrailingSeparators = cwd.replace(/\/+$/u, "");
  if (withoutTrailingSeparators.length === 0) return "/";
  const finalSeparator = withoutTrailingSeparators.lastIndexOf("/");
  return withoutTrailingSeparators.slice(finalSeparator + 1);
}

export function renameFromCwdAction(focus: TabToolFocus | null, spaces: readonly TabToolSpace[]): TabToolAction | null {
  if (!focus?.terminal || focus.shown !== null || !focus.space || !focus.tab) return null;
  const name = folderTabName(focus.cwd);
  if (name === null) return null;

  const space = spaces.find((candidate) => candidate.id === focus.space);
  if (!space?.tabs.some((tab) => tab.id === focus.tab)) return null;
  return { command: "tab.rename", args: { id: focus.tab, name } };
}

function matchingSpace(spaces: readonly TabToolSpace[], target: MoveTarget): TabToolSpace | null {
  if (!target.spaceId || !target.tabId) return null;
  const space = spaces.find((candidate) => candidate.id === target.spaceId);
  return space?.tabs.some((tab) => tab.id === target.tabId) ? space : null;
}
