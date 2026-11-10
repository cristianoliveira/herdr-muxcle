export type PaneAction = "focus" | "split-right" | "split-down" | "zoom" | "close";
export type WorkspaceChromeRole = "pane-footer" | "status-clock" | "workspace-bar" | "tab-picker" | "tab-actions";
export type WorkspaceChromeMode = "tabs" | "panels" | "combined";
export type TabTarget = { space: string; tab: string };
export type PanelTargets = { panel: string; stack: string; child: string };
export type LayoutNode = {
  id?: string;
  type?: string;
  hidden?: boolean;
  active?: string;
  children?: LayoutNode[];
};

type PaneSnapshot = {
  pane: string;
  terminal: string | null;
  mod?: string;
  tab: string;
  title: string;
  cwd: string | null;
  branch: string | null;
  status: string | null;
  program?: {
    name?: string | null;
    icon?: string | null;
    tint?: boolean;
    agent?: boolean;
    shell?: boolean;
  };
  focused?: boolean;
  zoomed: boolean;
};

type TabSnapshot = {
  id: string;
  name?: string;
  named?: boolean;
  active?: boolean;
  status?: string | null;
  zoomed?: boolean;
};

type SpaceSnapshot = {
  id: string;
  machine: string | null;
  active: boolean;
  branch?: string | null;
  tabs: TabSnapshot[];
};

export type PaneTarget = {
  pane: string;
  terminal: string | null;
  mod: string | null;
  tab: string;
};

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function twoDigits(value: number): string {
  return String(value).padStart(2, "0");
}

export function formatLocalClock(date: Date): string {
  return `${twoDigits(date.getHours())}:${twoDigits(date.getMinutes())} ${DAYS[date.getDay()]} ${twoDigits(date.getDate())}-${MONTHS[date.getMonth()]}-${twoDigits(date.getFullYear() % 100)}`;
}

export function modeFor(value: unknown): WorkspaceChromeMode | null {
  return value === "tabs" || value === "panels" || value === "combined" ? value : null;
}

export function roleFor(value: unknown): WorkspaceChromeRole | null {
  return value === "pane-footer" ||
    value === "status-clock" ||
    value === "workspace-bar" ||
    value === "tab-picker" ||
    value === "tab-actions"
    ? value
    : null;
}

export function tabLabel(tab: Pick<TabSnapshot, "name" | "named">, programName: string | null): string {
  if (tab.named) return tab.name ?? "";
  return programName || tab.name || "Terminal";
}

function localFolder(path: string | null, localHome: string | null): string {
  if (!path || !localHome) return path ?? "";
  if (path === localHome) return "~";
  return path.startsWith(`${localHome}/`) ? `~${path.slice(localHome.length)}` : path;
}

export function panePresentation(pane: PaneSnapshot, space: SpaceSnapshot | undefined, home: string) {
  const program = pane.program;
  const programName = program?.name || "";
  const title = ((program?.agent || program?.shell) && programName) || pane.title || programName || "shell";
  const localHome = space && space.machine === null ? home : null;

  return {
    title,
    folder: localFolder(pane.cwd, localHome),
    branch: pane.branch || null,
    status: pane.status,
    focused: Boolean(pane.focused),
    zoomed: pane.zoomed,
    program,
  };
}

export function capturePaneTarget(pane: Partial<PaneSnapshot> | null | undefined): PaneTarget | null {
  if (
    !pane ||
    typeof pane.pane !== "string" ||
    pane.pane.length === 0 ||
    typeof pane.tab !== "string" ||
    pane.tab.length === 0
  ) {
    return null;
  }

  return {
    pane: pane.pane,
    terminal: pane.terminal ?? null,
    mod: pane.mod ?? null,
    tab: pane.tab,
  };
}

export function paneAction(
  action: string,
  target: PaneTarget | null,
  currentPanes: PaneSnapshot[],
): { command: string; args: Record<string, unknown> } | null {
  if (!target) return null;

  const matches = currentPanes.filter((pane) => pane.pane === target.pane);
  if (matches.length !== 1) return null;

  const current = matches[0];
  if (
    !current ||
    current.tab !== target.tab ||
    (current.terminal ?? null) !== target.terminal ||
    (current.mod ?? null) !== target.mod
  ) {
    return null;
  }

  switch (action) {
    case "focus":
      return { command: "pane.focus", args: { pane: target.pane } };
    case "split-right":
      return { command: "pane.split", args: { direction: "right", pane: target.pane } };
    case "split-down":
      return { command: "pane.split", args: { direction: "down", pane: target.pane } };
    case "zoom":
      return { command: "pane.zoom", args: { pane: target.pane } };
    case "close":
      return { command: "pane.close", args: { pane: target.pane } };
    default:
      return null;
  }
}

function findUniqueNode(root: LayoutNode, id: string): LayoutNode | null {
  const found: LayoutNode[] = [];
  const visit = (node: LayoutNode) => {
    if (node.id === id) found.push(node);
    for (const child of node.children ?? []) visit(child);
  };
  visit(root);
  return found.length === 1 ? (found[0] ?? null) : null;
}

function hasDescendant(root: LayoutNode, expected: LayoutNode): boolean {
  return (root.children ?? []).some((child) => child === expected || hasDescendant(child, expected));
}

function firstVisibleChild(stack: LayoutNode): LayoutNode | null {
  return (stack.children ?? []).find((child) => child.hidden !== true) ?? null;
}

function selectedStackChild(stack: LayoutNode): LayoutNode | null {
  const activeMatches = (stack.children ?? []).filter((child) => child.id === stack.active && child.hidden !== true);
  if (activeMatches.length === 1) return activeMatches[0] ?? null;
  return firstVisibleChild(stack);
}

function visibleAncestors(
  root: LayoutNode,
  expected: LayoutNode,
  ancestorsVisible = true,
  ignoreRootHidden = false,
): boolean {
  const visit = (node: LayoutNode, visible: boolean, isRoot: boolean): boolean => {
    if (node === expected) return visible;
    const childrenVisible = visible && (isRoot && ignoreRootHidden ? true : node.hidden !== true);
    if (node.type === "stack") {
      const selected = selectedStackChild(node);
      return selected ? visit(selected, childrenVisible, false) : false;
    }
    return (node.children ?? []).some((child) => visit(child, childrenVisible, false));
  };

  return visit(root, ancestorsVisible, true);
}

export function panelState(
  layout: unknown,
  targets: PanelTargets,
): {
  available: boolean;
  visible: boolean;
  activeChild: string | null;
} {
  if (!layout || typeof layout !== "object") return { available: false, visible: false, activeChild: null };

  const root = layout as LayoutNode;
  const panel = findUniqueNode(root, targets.panel);
  const stack = findUniqueNode(root, targets.stack);
  const child = findUniqueNode(root, targets.child);
  if (
    !panel ||
    !["column", "row"].includes(panel.type ?? "") ||
    !stack ||
    stack.type !== "stack" ||
    !child ||
    !hasDescendant(panel, stack) ||
    !stack.children?.includes(child)
  ) {
    return { available: false, visible: false, activeChild: null };
  }

  const ancestorsAreVisible = visibleAncestors(root, panel);
  const visible = ancestorsAreVisible && panel.hidden !== true;
  const activeChild = selectedStackChild(stack)?.id ?? null;

  return {
    available:
      ancestorsAreVisible &&
      visibleAncestors(panel, stack, true, true) &&
      stack.hidden !== true &&
      stack.children?.includes(child) === true &&
      child.hidden !== true,
    visible,
    activeChild,
  };
}

export function panelAction(
  targets: PanelTargets,
  layout: unknown,
): { command: string; args: Record<string, unknown> }[] | null {
  const state = panelState(layout, targets);
  if (!state.available) return null;
  if (state.visible && state.activeChild === targets.child) {
    return [{ command: "layout.hide", args: { id: targets.panel } }];
  }
  return [
    { command: "layout.select", args: { stack: targets.stack, child: targets.child } },
    { command: "layout.show", args: { id: targets.panel } },
  ];
}

function tabMatches(target: TabTarget, spaces: SpaceSnapshot[]): { space: SpaceSnapshot; tab: TabSnapshot } | null {
  if (!target.space || !target.tab) return null;
  const spaceMatches = spaces.filter((space) => space.id === target.space);
  if (spaceMatches.length !== 1 || !spaceMatches[0]?.active) return null;
  const space = spaceMatches[0];
  const matches = space.tabs.filter((tab) => tab.id === target.tab);
  const globalMatches = spaces.flatMap((candidate) => candidate.tabs.filter((tab) => tab.id === target.tab));
  return matches.length === 1 && globalMatches.length === 1 && matches[0] ? { space, tab: matches[0] } : null;
}

export function tabAction(
  action: "select" | "close" | "rename",
  target: TabTarget | null,
  spaces: SpaceSnapshot[],
): { command: string; args: Record<string, unknown> } | null {
  if (!target) return null;
  const resolved = tabMatches(target, spaces);
  if (!resolved) return null;
  return {
    command: action === "select" ? "tab.select" : action === "close" ? "tab.close" : "tab.rename",
    args: { id: target.tab },
  };
}

export function tabMove(
  source: TabTarget | null,
  destination: TabTarget | null,
  spaces: SpaceSnapshot[],
): { command: string; args: Record<string, unknown> } | null {
  if (!source || !destination || source.space !== destination.space || source.tab === destination.tab) return null;
  const sourceMatch = tabMatches(source, spaces);
  const destinationMatch = tabMatches(destination, spaces);
  if (!sourceMatch || !destinationMatch || sourceMatch.space !== destinationMatch.space) return null;

  const destinationIndex = sourceMatch.space.tabs.findIndex((tab) => tab.id === destination.tab);
  if (destinationIndex < 0 || sourceMatch.space.tabs.filter((tab) => tab.id === destination.tab).length !== 1)
    return null;
  return { command: "tab.move", args: { id: source.tab, index: destinationIndex + 1 } };
}

export function windowControlsAllowed(metadata: { buttons?: boolean } | null | undefined, option: unknown): boolean {
  return metadata?.buttons === true && option !== "omit";
}
