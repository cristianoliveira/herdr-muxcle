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

export interface RecentTabVisit {
  space: string;
  tab: string;
}

export interface RecentTabsState {
  schema: 1;
  visits: RecentTabVisit[];
}

export const MAX_RECENT_TABS = 256;
const MAX_PERSISTED_RECENT_TABS = MAX_RECENT_TABS * 4;
const MAX_TARGET_ID_LENGTH = 4096;

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

export function matchesRecentTabsState(raw: unknown, expected: RecentTabsState): boolean {
  if (
    !isRecord(raw) ||
    raw.schema !== 1 ||
    !Array.isArray(raw.visits) ||
    raw.visits.length !== expected.visits.length
  ) {
    return false;
  }
  if (!hasOnlyKeys(raw, ["schema", "visits"])) return false;

  const visits = raw.visits;
  return expected.visits.every((visit, index) => {
    const candidate = visits[index];
    return (
      isRecord(candidate) &&
      hasOnlyKeys(candidate, ["space", "tab"]) &&
      candidate.space === visit.space &&
      candidate.tab === visit.tab
    );
  });
}

export function observeRecentTabs(raw: unknown, spaces: readonly HistorySpace[]): RecentTabsState {
  const source = isRecord(raw) && raw.schema === 1 && Array.isArray(raw.visits) ? raw.visits : [];
  const liveTargets = new Set(
    spaces.flatMap((space) =>
      isTargetId(space.id)
        ? space.tabs.filter((tab) => isTargetId(tab.id)).map((tab) => targetKey(space.id, tab.id))
        : [],
    ),
  );
  const visits: RecentTabVisit[] = [];
  const seen = new Set<string>();

  for (const value of source.slice(0, MAX_PERSISTED_RECENT_TABS)) {
    if (!isRecord(value) || !isTargetId(value.space) || !isTargetId(value.tab)) continue;
    const key = targetKey(value.space, value.tab);
    if (!liveTargets.has(key) || seen.has(key)) continue;
    seen.add(key);
    visits.push({ space: value.space, tab: value.tab });
  }

  const activeSpace = spaces.find((space) => space.active && isTargetId(space.id));
  const activeTab = activeSpace?.tabs.find((tab) => tab.active && isTargetId(tab.id));
  if (activeSpace && activeTab) {
    const key = targetKey(activeSpace.id, activeTab.id);
    const current = { space: activeSpace.id, tab: activeTab.id };
    return {
      schema: 1,
      visits: [current, ...visits.filter((visit) => targetKey(visit.space, visit.tab) !== key)].slice(
        0,
        MAX_RECENT_TABS,
      ),
    };
  }

  return { schema: 1, visits: visits.slice(0, MAX_RECENT_TABS) };
}

function targetKey(space: string, tab: string): string {
  return JSON.stringify([space, tab]);
}

function hasOnlyKeys(value: Record<string, unknown>, expected: readonly string[]): boolean {
  const keys = Object.keys(value);
  return keys.length === expected.length && expected.every((key) => Object.hasOwn(value, key));
}

function isTargetId(value: unknown): value is string {
  return typeof value === "string" && value.length > 0 && value.length <= MAX_TARGET_ID_LENGTH;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
