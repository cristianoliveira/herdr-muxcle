export type PickerAgentStatus = "working" | "blocked" | "done" | "idle";

export interface PickerSpace {
  id: string;
  name: string;
  machine: string | null;
  active: boolean;
  tabs: readonly { id: string; name: string; active: boolean; status?: unknown; panes?: unknown }[];
}

export type PickerDescendants =
  | { kind: "exact"; count: number }
  | { kind: "lower-bound"; count: number }
  | { kind: "unavailable" };

export interface PickerRowContext {
  status: PickerAgentStatus | null;
  programs: string[];
  programsTruncated: boolean;
  descendants: PickerDescendants;
}

export interface PickerRow {
  key: string;
  kind: "tab" | "space";
  id: string;
  label: string;
  machine: string | null;
  active: boolean;
  spaceId?: string;
  context?: PickerRowContext;
}

export interface PickerAction {
  command: "tab.select" | "space.select";
  args: { id: string };
}

export type PickerOrder = "native" | "recent";

export interface PickerConfig {
  order: PickerOrder;
  agentContext: boolean;
  management: boolean;
  remoteSpaces: boolean;
}

export interface PickerPaneScope {
  pane: string;
  terminal: string | null;
  mod: string | null;
}

export interface PickerFocusedContext {
  space: string;
  tab: string;
  pane: string | null;
  terminal: string | null;
  shown: string | null;
}

export interface PickerPeer {
  id: string;
  name: string;
  state: "connected";
  temporary?: boolean;
}

export interface PickerCloseTarget {
  spaceId: string;
  spaceName: string;
  machine: string | null;
  peerId: string | null;
  tabId: string;
  tabName: string;
  panes: PickerPaneScope[];
  focusedPane: { pane: string | null; terminal: string | null; shown: string | null } | null;
}

export type PickerManagementAction =
  | { key: string; kind: "new-tab"; label: string; spaceId: string; machine: string | null; peerId: string | null }
  | { key: string; kind: "new-local-space"; label: string }
  | { key: string; kind: "new-peer-space"; label: string; machine: string; peerId: string }
  | { key: string; kind: "close-tab"; label: string; target: PickerCloseTarget };

export interface PickerManagementOptions {
  enabled: boolean;
  remoteSpaces: boolean;
  connectedPeers: readonly PickerPeer[] | null;
  focused: PickerFocusedContext | null;
  selectedKey: string | null;
  panes: unknown;
}

export interface PickerOptions {
  agents?: readonly unknown[];
  order?: PickerOrder;
  recentState?: unknown;
  historyBlockVisible?: boolean;
  agentContext?: boolean;
  terminals?: unknown;
}

interface RecentTabVisit {
  space: string;
  tab: string;
}

interface PickerCandidate {
  row: PickerRow;
  searchText: string;
  spaceId?: string;
  tab?: PickerSpace["tabs"][number];
}

const MAX_CONFIG_LENGTH = 4096;
const MAX_RECENT_INPUT = 1024;
const MAX_TARGET_ID_LENGTH = 4096;
const MAX_LAYOUT_NODES = 2048;
const MAX_LAYOUT_DEPTH = 64;
const MAX_AGENT_NAME_LENGTH = 512;
const MAX_CONTEXT_PROGRAMS = 8;
const MAX_CONTEXT_PROGRAM_LENGTH = 128;
const MAX_TERMINAL_RECORDS = 4096;
const MAX_DESCENDANT_DEPTH = 32;
const MAX_DESCENDANT_VISITS = 2048;
const MAX_CONTEXT_VISITS = 8192;
const MAX_CONTEXT_ROOTS = 128;
const MAX_MACHINE_LIST_LENGTH = 262144;
const MAX_MACHINE_RECORDS = 512;
const MAX_MACHINE_ID_LENGTH = 512;
const MAX_MACHINE_NAME_LENGTH = 256;
const MAX_MACHINE_STATE_LENGTH = 64;
const MAX_PANE_SCOPE = 256;
const LOCAL_MACHINE_ALIAS = "local";

export function parsePickerConfig(raw: string | null): PickerConfig {
  const fallback = { order: "native", agentContext: false, management: false, remoteSpaces: false } as const;
  if (raw === null || raw.length > MAX_CONFIG_LENGTH) return fallback;

  try {
    const value: unknown = JSON.parse(raw);
    if (!isRecord(value) || value.schema !== 1) return fallback;
    const orderIsValid = !Object.hasOwn(value, "order") || value.order === "native" || value.order === "recent";
    const order = value.order === "recent" ? "recent" : "native";
    return {
      order,
      agentContext: orderIsValid && value.agentContext === true,
      management: orderIsValid && value.management === true,
      remoteSpaces: orderIsValid && value.management === true && value.remoteSpaces === true,
    };
  } catch {
    return fallback;
  }
}

export function parsePickerOrder(raw: string | null): PickerOrder {
  return parsePickerConfig(raw).order;
}

export function parseConnectedPeers(raw: unknown): PickerPeer[] | null {
  if (typeof raw !== "string" || raw.length > MAX_MACHINE_LIST_LENGTH) return null;

  try {
    const value: unknown = JSON.parse(raw);
    if (!isRecord(value) || !Array.isArray(value.machines) || value.machines.length > MAX_MACHINE_RECORDS) return null;

    const peers: PickerPeer[] = [];
    const seenNames = new Set<string>();
    const seenIds = new Set<string>();
    for (const candidate of value.machines) {
      if (
        !isRecord(candidate) ||
        !isNativeMachineText(candidate.id, MAX_MACHINE_ID_LENGTH) ||
        !isNativeMachineText(candidate.name, MAX_MACHINE_NAME_LENGTH) ||
        !isNativeMachineText(candidate.state, MAX_MACHINE_STATE_LENGTH) ||
        (candidate.temporary !== undefined && typeof candidate.temporary !== "boolean") ||
        seenNames.has(candidate.name) ||
        seenIds.has(candidate.id)
      ) {
        return null;
      }
      seenNames.add(candidate.name);
      seenIds.add(candidate.id);
      if (candidate.state !== "connected") continue;
      peers.push({
        id: candidate.id,
        name: candidate.name,
        state: "connected",
        ...(typeof candidate.temporary === "boolean" ? { temporary: candidate.temporary } : {}),
      });
    }
    return peers;
  } catch {
    return null;
  }
}

export function connectedPeerIsCurrent(machine: string, peerId: string, peers: readonly PickerPeer[] | null): boolean {
  if (
    !Array.isArray(peers) ||
    !isNativeMachineText(machine, MAX_MACHINE_NAME_LENGTH) ||
    !isNativeMachineText(peerId, MAX_MACHINE_ID_LENGTH)
  ) {
    return false;
  }
  const nameMatches = peers.filter((peer) => peer.name === machine);
  const idMatches = peers.filter((peer) => peer.id === peerId);
  // Herdr 0.1.13's document-backed mutations reject temporary machines.
  return (
    nameMatches.length === 1 &&
    idMatches.length === 1 &&
    nameMatches[0] === idMatches[0] &&
    nameMatches[0].state === "connected" &&
    nameMatches[0].temporary !== true
  );
}

export function pickerManagementActions(
  spaces: readonly PickerSpace[],
  options: PickerManagementOptions,
): PickerManagementAction[] {
  if (!options.enabled) return [];

  const peerListAvailable = Array.isArray(options.connectedPeers);
  const remoteEnabled = options.remoteSpaces && peerListAvailable;
  const connectedPeer = (machine: string): PickerPeer | null => {
    if (!remoteEnabled || !Array.isArray(options.connectedPeers)) return null;
    const matches = options.connectedPeers.filter((peer) => peer.name === machine);
    if (matches.length !== 1 || !connectedPeerIsCurrent(machine, matches[0].id, options.connectedPeers)) return null;
    return matches[0];
  };
  const actions: PickerManagementAction[] = [];
  const focused = options.focused === null ? [] : spaces.filter((space) => space.id === options.focused?.space);
  if (focused.length === 1) {
    const space = focused[0];
    const peer = space.machine === null ? null : connectedPeer(space.machine);
    const canTargetSpace = space.machine === null || peer !== null;
    if (canTargetSpace) {
      actions.push({
        key: managementKey("new-tab", space.machine, space.id, peer?.id ?? null),
        kind: "new-tab",
        label: `New tab in ${space.name}`,
        spaceId: space.id,
        machine: space.machine,
        peerId: peer?.id ?? null,
      });
    }
  }

  actions.push({
    key: managementKey("new-local-space"),
    kind: "new-local-space",
    label: "New local space",
  });

  if (remoteEnabled && options.connectedPeers) {
    for (const peer of options.connectedPeers) {
      if (peer.state !== "connected" || !isBoundedString(peer.name, MAX_MACHINE_NAME_LENGTH)) continue;
      if (!connectedPeerIsCurrent(peer.name, peer.id, options.connectedPeers)) continue;
      actions.push({
        key: managementKey("new-peer-space", peer.name, peer.id),
        kind: "new-peer-space",
        label: `New space on ${peer.name}`,
        machine: peer.name,
        peerId: peer.id,
      });
    }
  }

  const selected =
    options.selectedKey === null
      ? undefined
      : pickerRows(spaces, "").find((row) => row.key === options.selectedKey && row.kind === "tab");
  if (!selected || (selected.machine !== null && !connectedPeer(selected.machine))) return actions;

  const peer = selected.machine === null ? null : connectedPeer(selected.machine);
  const target = closeTargetForRow(spaces, selected, options.panes, options.focused, peer?.id ?? null);
  if (target) {
    actions.push({
      key: managementKey("close-tab", target.machine, target.peerId, target.spaceId, target.tabId),
      kind: "close-tab",
      label: `Close selected tab: ${target.tabName}`,
      target,
    });
  }
  return actions;
}

export function closeTargetIsCurrent(
  target: PickerCloseTarget,
  spaces: readonly PickerSpace[],
  panes: unknown,
  focused: PickerFocusedContext | null,
  connectedPeers: readonly PickerPeer[] | null = null,
): boolean {
  if (
    target.machine === null
      ? target.peerId !== null
      : !connectedPeerIsCurrent(target.machine, target.peerId ?? "", connectedPeers)
  )
    return false;
  const matchingSpaces = spaces.filter((space) => space.id === target.spaceId && space.machine === target.machine);
  if (matchingSpaces.length !== 1) return false;

  const matchingTabs = matchingSpaces[0].tabs.filter((tab) => tab.id === target.tabId);
  if (matchingTabs.length !== 1) return false;
  const scope = paneScope(target.tabId, matchingTabs[0].panes, panes);
  if (scope === null || JSON.stringify(scope) !== JSON.stringify(target.panes)) return false;
  const focus =
    focused?.space === target.spaceId && focused.tab === target.tabId
      ? { pane: focused.pane, terminal: focused.terminal, shown: focused.shown }
      : null;
  return JSON.stringify(focus) === JSON.stringify(target.focusedPane);
}

export function pickerRows(spaces: readonly PickerSpace[], query: string, options: PickerOptions = {}): PickerRow[] {
  const letters = [...query.slice(0, 256).toLowerCase().replace(/\s+/g, "")];
  const useRecentOrder = options.order === "recent" && options.historyBlockVisible === true;
  const ranks = useRecentOrder ? recentRanks(options.recentState) : new Map<string, number>();
  const agentRecords = Array.isArray(options.agents) ? options.agents : [];
  const agentsByTarget = agentNamesByTarget(agentRecords);
  const orderedSpaces = useRecentOrder ? sortSpacesByRecent(spaces, ranks) : spaces;
  const candidates = orderedSpaces.flatMap((space): PickerCandidate[] => {
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
        spaceId: space.id,
      };
      const agentNames = agentsByTarget.get(targetKey(space.id, tab.id)) ?? [];
      return { row, searchText: searchText(row, agentNames), spaceId: space.id, tab };
    });
  });

  const matching = candidates.filter(({ searchText: text }) => matches(text, letters));
  if (options.agentContext !== true || matching.length === 0) return matching.map(({ row }) => row);

  const agentContexts = agentContextsByTarget(agentRecords);
  const graph = terminalGraph(options.terminals);
  const budget = { remaining: MAX_CONTEXT_VISITS };
  return matching.map(({ row, spaceId, tab }) => {
    if (!spaceId || !tab) return row;
    const context = rowContext(spaceId, tab, agentContexts, graph, budget);
    return context ? { ...row, context } : row;
  });
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

interface ContextAgent {
  target: string;
  address: string | null;
  status: PickerAgentStatus | null;
  app: string | null;
  program: string | null;
}

interface ContextAgentBucket {
  entries: ContextAgent[];
  rootAddresses: string[];
  rootMembershipUnknown: boolean;
  incomplete: boolean;
}

interface TerminalGraph {
  children: Map<string, string[]>;
  states: Map<string, string>;
  missingParents: Set<string>;
  complete: boolean;
}

function agentContextsByTarget(raw: readonly unknown[]): Map<string, ContextAgentBucket> {
  const byAddress = new Map<string, ContextAgent>();
  const rootAddresses = new Map<string, Set<string>>();
  const targetsByAddress = new Map<string, Set<string>>();
  const conflictedAddresses = new Set<string>();
  const conflictedTargets = new Set<string>();
  const ambiguousRootTargets = new Set<string>();
  const withoutAddress: ContextAgent[] = [];

  for (const candidate of raw) {
    const entry = contextAgent(candidate);
    if (!entry) continue;
    if (!entry.address) {
      withoutAddress.push(entry);
      continue;
    }
    const addresses = rootAddresses.get(entry.target) ?? new Set<string>();
    addresses.add(entry.address);
    rootAddresses.set(entry.target, addresses);
    const targets = targetsByAddress.get(entry.address) ?? new Set<string>();
    if (targets.size > 0 && !targets.has(entry.target)) {
      ambiguousRootTargets.add(entry.target);
      for (const target of targets) ambiguousRootTargets.add(target);
    }
    targets.add(entry.target);
    targetsByAddress.set(entry.address, targets);
    if (conflictedAddresses.has(entry.address)) {
      conflictedTargets.add(entry.target);
      continue;
    }

    const previous = byAddress.get(entry.address);
    if (!previous) {
      byAddress.set(entry.address, entry);
      continue;
    }
    if (sameContextAgent(previous, entry)) continue;

    byAddress.delete(entry.address);
    conflictedAddresses.add(entry.address);
    conflictedTargets.add(previous.target);
    conflictedTargets.add(entry.target);
  }

  const buckets = new Map<string, ContextAgentBucket>();
  const bucketFor = (target: string): ContextAgentBucket => {
    let bucket = buckets.get(target);
    if (!bucket) {
      bucket = { entries: [], rootAddresses: [], rootMembershipUnknown: false, incomplete: false };
      buckets.set(target, bucket);
    }
    return bucket;
  };

  for (const [target, addresses] of rootAddresses) {
    bucketFor(target).rootAddresses = [...addresses];
  }
  for (const entry of byAddress.values()) bucketFor(entry.target).entries.push(entry);
  for (const entry of withoutAddress) {
    const bucket = bucketFor(entry.target);
    bucket.entries.push(entry);
    bucket.rootMembershipUnknown = true;
    bucket.incomplete = true;
  }
  for (const target of conflictedTargets) bucketFor(target).incomplete = true;
  for (const target of ambiguousRootTargets) bucketFor(target).rootMembershipUnknown = true;
  return buckets;
}

function contextAgent(value: unknown): ContextAgent | null {
  if (!isRecord(value) || !isTargetId(value.space) || !isTargetId(value.tab)) return null;
  const program = isRecord(value.program) ? boundedContextName(value.program.name) : null;
  return {
    target: targetKey(value.space, value.tab),
    address: isTargetId(value.address) ? value.address : null,
    status: isPickerAgentStatus(value.status) ? value.status : null,
    app: boundedContextName(value.app),
    program,
  };
}

function sameContextAgent(left: ContextAgent, right: ContextAgent): boolean {
  return (
    left.target === right.target &&
    left.status === right.status &&
    left.app === right.app &&
    left.program === right.program
  );
}

function boundedContextName(value: unknown): string | null {
  if (typeof value !== "string" || value.length === 0) return null;
  return value.slice(0, MAX_CONTEXT_PROGRAM_LENGTH);
}

function isPickerAgentStatus(value: unknown): value is PickerAgentStatus {
  return value === "working" || value === "blocked" || value === "done" || value === "idle";
}

function terminalGraph(value: unknown): TerminalGraph | null {
  if (!Array.isArray(value)) return null;
  const graph: TerminalGraph = {
    children: new Map(),
    states: new Map(),
    missingParents: new Set(),
    complete: value.length <= MAX_TERMINAL_RECORDS,
  };
  const records = new Map<string, { parent: string | null; state: string }>();
  const conflicts = new Set<string>();

  for (const candidate of value.slice(0, MAX_TERMINAL_RECORDS)) {
    if (
      !isRecord(candidate) ||
      !isTargetId(candidate.address) ||
      !(candidate.parent === null || candidate.parent === undefined || isTargetId(candidate.parent)) ||
      typeof candidate.state !== "string"
    ) {
      graph.complete = false;
      continue;
    }

    const record = { parent: candidate.parent ?? null, state: candidate.state };
    if (conflicts.has(candidate.address)) {
      graph.complete = false;
      continue;
    }
    const previous = records.get(candidate.address);
    if (previous) {
      if (previous.parent === record.parent && previous.state === record.state) continue;
      records.delete(candidate.address);
      conflicts.add(candidate.address);
      graph.complete = false;
      continue;
    }
    records.set(candidate.address, record);
  }

  for (const [address, record] of records) {
    graph.states.set(address, record.state);
    if (!record.parent) continue;
    const children = graph.children.get(record.parent) ?? [];
    children.push(address);
    graph.children.set(record.parent, children);
    if (!records.has(record.parent)) graph.missingParents.add(record.parent);
  }
  return graph;
}

function rowContext(
  spaceId: string,
  tab: PickerSpace["tabs"][number],
  agentsByTarget: ReadonlyMap<string, ContextAgentBucket>,
  graph: TerminalGraph | null,
  budget: { remaining: number },
): PickerRowContext | null {
  const tabStatus = isPickerAgentStatus(tab.status) ? tab.status : null;
  const bucket = agentsByTarget.get(targetKey(spaceId, tab.id));
  const entries = bucket?.entries ?? [];
  const agentStatuses = new Set(entries.flatMap((entry) => (entry.status ? [entry.status] : [])));
  const status = tabStatus ?? (agentStatuses.size === 1 ? [...agentStatuses][0] : null);
  if (status === null && !bucket) return null;

  const programs = new Map<string, string>();
  let programsTruncated = false;
  for (const entry of entries) {
    const name = entry.program ?? entry.app;
    if (!name) continue;
    const key = name.toLowerCase();
    if (programs.has(key)) continue;
    if (programs.size >= MAX_CONTEXT_PROGRAMS) {
      programsTruncated = true;
      continue;
    }
    programs.set(key, name);
  }

  return {
    status,
    programs: [...programs.values()],
    programsTruncated,
    descendants: countLiveDescendants(
      bucket?.rootAddresses ?? [],
      graph,
      bucket?.rootMembershipUnknown ?? false,
      bucket?.incomplete ?? false,
      budget,
    ),
  };
}

function countLiveDescendants(
  rawRoots: readonly string[],
  graph: TerminalGraph | null,
  rootMembershipUnknown: boolean,
  agentDataIncomplete: boolean,
  budget: { remaining: number },
): PickerDescendants {
  if (rootMembershipUnknown || !graph || rawRoots.length === 0) return { kind: "unavailable" };

  const allRoots = [...new Set(rawRoots)];
  const roots = allRoots.slice(0, MAX_CONTEXT_ROOTS);
  let complete = graph.complete && !agentDataIncomplete && allRoots.length <= MAX_CONTEXT_ROOTS;
  const rootSet = new Set(allRoots);
  if ([...graph.missingParents].some((parent) => !rootSet.has(parent))) complete = false;

  const visited = new Set(allRoots);
  const queue = roots.map((address) => ({ address, depth: 0, path: new Set([address]) }));
  let count = 0;
  let visits = 0;

  for (let index = 0; index < queue.length; index += 1) {
    const current = queue[index];
    const children = graph.children.get(current.address) ?? [];
    if (current.depth >= MAX_DESCENDANT_DEPTH) {
      if (children.length > 0) complete = false;
      continue;
    }

    for (const address of children) {
      if (current.path.has(address)) {
        complete = false;
        continue;
      }
      if (visited.has(address)) continue;
      if (visits >= MAX_DESCENDANT_VISITS || budget.remaining <= 0) {
        complete = false;
        break;
      }

      visited.add(address);
      visits += 1;
      budget.remaining -= 1;
      if (graph.states.get(address) === "live" && !rootSet.has(address)) count += 1;
      const path = new Set(current.path);
      path.add(address);
      queue.push({ address, depth: current.depth + 1, path });
    }
  }

  return complete ? { kind: "exact", count } : { kind: "lower-bound", count };
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

function isBoundedString(value: unknown, maximum: number): value is string {
  return typeof value === "string" && value.length > 0 && value.length <= maximum;
}

function isNativeMachineText(value: unknown, maximum: number): value is string {
  return typeof value === "string" && value.length > 0 && value.length <= maximum && !value.includes("\0");
}

function managementKey(kind: string, ...identity: (string | null)[]): string {
  return JSON.stringify(["management", kind, ...identity]);
}

function closeTargetForRow(
  spaces: readonly PickerSpace[],
  row: PickerRow,
  panes: unknown,
  focused: PickerFocusedContext | null,
  peerId: string | null,
): PickerCloseTarget | null {
  if (!row.spaceId) return null;
  const spaceMatches = spaces.filter((space) => space.id === row.spaceId && space.machine === row.machine);
  if (spaceMatches.length !== 1) return null;
  const space = spaceMatches[0];
  const tabs = space.tabs.filter((tab) => tab.id === row.id);
  if (tabs.length !== 1) return null;
  const tab = tabs[0];
  const scope = paneScope(tab.id, tab.panes, panes);
  if (!scope) return null;

  return {
    spaceId: space.id,
    spaceName: space.name,
    machine: space.machine,
    peerId,
    tabId: tab.id,
    tabName: tab.name,
    panes: scope,
    focusedPane:
      focused?.space === space.id && focused.tab === tab.id
        ? { pane: focused.pane, terminal: focused.terminal, shown: focused.shown }
        : null,
  };
}

function paneScope(tabId: string, count: unknown, raw: unknown): PickerPaneScope[] | null {
  if (
    !Number.isSafeInteger(count) ||
    (count as number) < 1 ||
    (count as number) > MAX_PANE_SCOPE ||
    !Array.isArray(raw) ||
    raw.length > MAX_PANE_SCOPE
  )
    return null;

  const matching: PickerPaneScope[] = [];
  const paneIds = new Set<string>();
  for (const candidate of raw) {
    if (!isRecord(candidate) || !isTargetId(candidate.tab) || !isTargetId(candidate.pane)) return null;
    if (candidate.tab !== tabId) continue;
    if (
      (candidate.terminal !== null && !isTargetId(candidate.terminal)) ||
      (candidate.mod !== undefined && candidate.mod !== null && !isBoundedString(candidate.mod, 256)) ||
      paneIds.has(candidate.pane)
    )
      return null;
    paneIds.add(candidate.pane);
    matching.push({
      pane: candidate.pane,
      terminal: candidate.terminal as string | null,
      mod: typeof candidate.mod === "string" ? candidate.mod : null,
    });
  }
  if (matching.length !== count) return null;
  return matching.sort((left, right) => left.pane.localeCompare(right.pane));
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
