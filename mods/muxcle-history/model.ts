export interface HistorySpace {
  id: string;
  active: boolean;
  tabs: readonly { id: string; active: boolean }[];
}

export interface HistoryState {
  schema: 1;
  spaces: string[];
  tabs: Record<string, string[]>;
}

export interface HistoryAction {
  command: "space.select" | "tab.select";
  args: { id: string };
}

export function observeHistory(raw: unknown, spaces: readonly HistorySpace[]): HistoryState {
  const source = isRecord(raw) && raw.schema === 1 ? raw : {};
  const tabHistory = isRecord(source.tabs) ? source.tabs : {};
  const visits = spaces
    .map((space): [string, string[]] => [space.id, observeVisits(tabHistory[space.id], space.tabs, space.active)])
    .filter(([, history]) => history.length > 0)
    .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0));

  return {
    schema: 1,
    spaces: observeVisits(source.spaces, spaces, true),
    tabs: Object.fromEntries(visits),
  };
}

export function previousAction(
  kind: "last-tab" | "last-space",
  raw: unknown,
  spaces: readonly HistorySpace[],
): HistoryAction | null {
  const activeSpace = spaces.find((space) => space.active);
  if (!activeSpace) return null;
  const state = observeHistory(raw, spaces);
  const id = kind === "last-space" ? state.spaces[1] : state.tabs[activeSpace.id]?.[1];
  if (!id) return null;
  return { command: kind === "last-space" ? "space.select" : "tab.select", args: { id } };
}

function observeVisits(
  raw: unknown,
  items: readonly { id: string; active: boolean }[],
  observeActive: boolean,
): string[] {
  const liveIds = new Set(items.map((item) => item.id));
  const previous = Array.isArray(raw)
    ? [...new Set(raw.filter((id): id is string => typeof id === "string" && liveIds.has(id)))]
    : [];
  const current = observeActive ? items.find((item) => item.active)?.id : undefined;
  return (current ? [current, ...previous.filter((id) => id !== current)] : previous).slice(0, 2);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
