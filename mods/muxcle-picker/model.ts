export interface PickerSpace {
  id: string;
  name: string;
  machine: string | null;
  active: boolean;
  tabs: readonly { id: string; name: string; active: boolean }[];
}

export interface PickerRow {
  key: string;
  kind: "tab" | "space";
  id: string;
  label: string;
  machine: string | null;
  active: boolean;
}

export interface PickerAction {
  command: "tab.select" | "space.select";
  args: { id: string };
}

export type PickerOrder = "native" | "recent";

export interface PickerOptions {
  agents?: readonly unknown[];
  order?: PickerOrder;
  recentState?: unknown;
  historyBlockVisible?: boolean;
}

interface RecentTabVisit {
  space: string;
  tab: string;
}

const MAX_CONFIG_LENGTH = 4096;
const MAX_RECENT_INPUT = 1024;
const MAX_TARGET_ID_LENGTH = 4096;
const MAX_LAYOUT_NODES = 2048;
const MAX_LAYOUT_DEPTH = 64;
const MAX_AGENT_NAME_LENGTH = 512;
const LOCAL_MACHINE_ALIAS = "local";

export function parsePickerOrder(raw: string | null): PickerOrder {
  if (raw === null || raw.length > MAX_CONFIG_LENGTH) return "native";

  try {
    const value: unknown = JSON.parse(raw);
    if (isRecord(value) && value.schema === 1 && value.order === "recent") return "recent";
  } catch {
    return "native";
  }
  return "native";
}

export function pickerRows(spaces: readonly PickerSpace[], query: string, options: PickerOptions = {}): PickerRow[] {
  const letters = [...query.slice(0, 256).toLowerCase().replace(/\s+/g, "")];
  const useRecentOrder = options.order === "recent" && options.historyBlockVisible === true;
  const ranks = useRecentOrder ? recentRanks(options.recentState) : new Map<string, number>();
  const agentRecords = Array.isArray(options.agents) ? options.agents : [];
  const agentsByTarget = agentNamesByTarget(agentRecords);
  const orderedSpaces = useRecentOrder ? sortSpacesByRecent(spaces, ranks) : spaces;
  const candidates = orderedSpaces.flatMap((space): { row: PickerRow; searchText: string }[] => {
    if (space.tabs.length === 0) {
      const row: PickerRow = {
        key: JSON.stringify(["space", space.machine, space.id]),
        kind: "space",
        id: space.id,
        label: space.name,
        machine: space.machine,
        active: space.active,
      };
      return [{ row, searchText: searchText(row, []) }];
    }

    const orderedTabs = useRecentOrder ? sortTabsByRecent(space, ranks) : space.tabs;
    return orderedTabs.map((tab) => {
      const row: PickerRow = {
        key: JSON.stringify(["tab", space.machine, space.id, tab.id]),
        kind: "tab",
        id: tab.id,
        label: `${space.name} → ${tab.name}`,
        machine: space.machine,
        active: space.active && tab.active,
      };
      const agentNames = agentsByTarget.get(targetKey(space.id, tab.id)) ?? [];
      return { row, searchText: searchText(row, agentNames) };
    });
  });

  return candidates.filter(({ searchText: text }) => matches(text, letters)).map(({ row }) => row);
}

export function hasVisibleHistoryBlock(layout: unknown): boolean {
  const pending: { node: unknown; depth: number }[] = [{ node: layout, depth: 0 }];
  let visited = 0;

  while (pending.length > 0) {
    const current = pending.pop()!;
    if (current.depth > MAX_LAYOUT_DEPTH || ++visited > MAX_LAYOUT_NODES) return false;
    if (!isRecord(current.node) || current.node.hidden === true) continue;

    const node = current.node;
    if (node.type === "block" && isHistoryContent(node.content)) return true;

    if (Array.isArray(node.floating)) {
      for (const floating of node.floating) {
        if (++visited > MAX_LAYOUT_NODES) return false;
        if (isRecord(floating) && floating.hidden !== true && isHistoryContent(floating.content)) return true;
      }
    }

    if (node.type === "row" || node.type === "column") {
      if (!Array.isArray(node.children) || node.children.length > MAX_LAYOUT_NODES - visited - pending.length)
        return false;
      for (let index = node.children.length - 1; index >= 0; index -= 1) {
        pending.push({ node: node.children[index], depth: current.depth + 1 });
      }
      continue;
    }

    if (node.type === "stack" && Array.isArray(node.children)) {
      if (node.children.length > MAX_LAYOUT_NODES - visited - pending.length) return false;
      const children = node.children.filter((child) => isRecord(child) && child.hidden !== true);
      const active = typeof node.active === "string" ? children.find((child) => child.id === node.active) : undefined;
      const selected = active ?? children[0];
      if (selected) pending.push({ node: selected, depth: current.depth + 1 });
    }
  }

  return false;
}

/** Herdr supplies native space/tab IDs; display names never determine an agent's target. */
function agentNamesByTarget(raw: readonly unknown[]): Map<string, string[]> {
  const namesByTarget = new Map<string, string[]>();
  for (const candidate of raw) {
    if (!isRecord(candidate) || !isTargetId(candidate.space) || !isTargetId(candidate.tab)) continue;

    const names = [candidate.app, isRecord(candidate.program) ? candidate.program.name : null];
    const target = targetKey(candidate.space, candidate.tab);
    const searchNames = namesByTarget.get(target) ?? [];
    for (const name of names) {
      if (typeof name !== "string" || name.length === 0) continue;
      const boundedName = name.slice(0, MAX_AGENT_NAME_LENGTH);
      if (!searchNames.some((existing) => existing.toLowerCase() === boundedName.toLowerCase())) {
        searchNames.push(boundedName);
      }
    }
    if (searchNames.length > 0) namesByTarget.set(target, searchNames);
  }
  return namesByTarget;
}

function searchText(row: PickerRow, agentNames: readonly string[]): string {
  return [row.machine ?? LOCAL_MACHINE_ALIAS, row.label, ...agentNames].join(" ");
}

function isHistoryContent(value: unknown): boolean {
  return isRecord(value) && value.mod === "muxcle-history";
}

function recentRanks(raw: unknown): Map<string, number> {
  if (!isRecord(raw) || raw.schema !== 1 || !Array.isArray(raw.visits)) return new Map();

  const ranks = new Map<string, number>();
  for (const [index, visit] of raw.visits.slice(0, MAX_RECENT_INPUT).entries()) {
    if (!isRecord(visit) || !isTargetId(visit.space) || !isTargetId(visit.tab)) continue;
    const key = targetKey(visit.space, visit.tab);
    if (!ranks.has(key)) ranks.set(key, index);
  }
  return ranks;
}

function sortSpacesByRecent(spaces: readonly PickerSpace[], ranks: ReadonlyMap<string, number>): PickerSpace[] {
  return spaces
    .map((space, index) => ({ space, index, rank: spaceRecentRank(space, ranks) }))
    .sort((left, right) => compareRank(left.rank, right.rank) || left.index - right.index)
    .map(({ space }) => space);
}

function sortTabsByRecent(space: PickerSpace, ranks: ReadonlyMap<string, number>): PickerSpace["tabs"] {
  return space.tabs
    .map((tab, index) => ({ tab, index, rank: recentRank(space.id, tab.id, ranks) }))
    .sort((left, right) => compareRank(left.rank, right.rank) || left.index - right.index)
    .map(({ tab }) => tab);
}

function spaceRecentRank(space: PickerSpace, ranks: ReadonlyMap<string, number>): number | null {
  return space.tabs.reduce<number | null>((best, tab) => {
    const rank = recentRank(space.id, tab.id, ranks);
    return rank === null ? best : best === null ? rank : Math.min(best, rank);
  }, null);
}

function recentRank(space: string, tab: string, ranks: ReadonlyMap<string, number>): number | null {
  if (!isTargetId(space) || !isTargetId(tab)) return null;
  return ranks.get(targetKey(space, tab)) ?? null;
}

function compareRank(left: number | null, right: number | null): number {
  if (left === null) return right === null ? 0 : 1;
  if (right === null) return -1;
  return left - right;
}

function targetKey(space: string, tab: string): string {
  return JSON.stringify([space, tab]);
}

function isTargetId(value: unknown): value is string {
  return typeof value === "string" && value.length > 0 && value.length <= MAX_TARGET_ID_LENGTH;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

export function selectedRowKey(
  rows: readonly PickerRow[],
  previous: string | null,
  invalidated = false,
): string | null {
  if (invalidated) return null;
  if (previous !== null) return rows.find((row) => row.key === previous)?.key ?? null;
  return rows.find((row) => row.active)?.key ?? rows[0]?.key ?? null;
}

export function selectionAction(
  spaces: readonly PickerSpace[],
  query: string,
  key: string,
  options: Pick<PickerOptions, "agents"> = {},
): PickerAction | null {
  const row = pickerRows(spaces, query, options).find((entry) => entry.key === key);
  return row ? { command: row.kind === "tab" ? "tab.select" : "space.select", args: { id: row.id } } : null;
}

function matches(label: string, letters: readonly string[]): boolean {
  const text = label.toLowerCase();
  let position = 0;
  for (const letter of letters) {
    const found = text.indexOf(letter, position);
    if (found < 0) return false;
    position = found + 1;
  }
  return true;
}
