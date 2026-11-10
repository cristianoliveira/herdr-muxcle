export type SidebarRole = "spaces" | "agents";
export type SidebarStatus = "working" | "blocked" | "done" | "idle" | "unknown";
export type DisplayStatus = SidebarStatus | null;

export interface SpaceSnapshot {
  id?: unknown;
  active?: unknown;
  status?: unknown;
}

export interface AgentSnapshot {
  address?: unknown;
  pane?: unknown;
  status?: unknown;
}

export interface PaneSnapshot {
  pane?: unknown;
  terminal?: unknown;
}

export interface NumberedSpaceRow {
  id: string;
  number: number;
  selected: boolean;
  status: DisplayStatus;
}

export interface NumberedAgentRow {
  address: string;
  pane: string | null;
  number: number;
  status: SidebarStatus;
}

export type SelectionAction =
  | { command: "space.select"; args: { id: string } }
  | { command: "pane.focus"; args: { pane: string } };

const STATUSES = new Set<SidebarStatus>(["working", "blocked", "done", "idle", "unknown"]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function nonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function statusOrUnknown(value: unknown): SidebarStatus {
  return typeof value === "string" && STATUSES.has(value as SidebarStatus) ? (value as SidebarStatus) : "unknown";
}

function spaceStatus(value: unknown): DisplayStatus {
  if (value === null) return null;
  return statusOrUnknown(value);
}

export function roleFor(value: unknown): SidebarRole | null {
  return value === "spaces" || value === "agents" ? value : null;
}

export function spaceRows(spaces: readonly SpaceSnapshot[]): NumberedSpaceRow[] {
  return spaces.flatMap((space, index) => {
    if (!isRecord(space) || !nonEmptyString(space.id)) return [];
    return [
      {
        id: space.id,
        number: index + 1,
        selected: space.active === true,
        status: spaceStatus(space.status),
      },
    ];
  });
}

export function agentRows(agents: readonly AgentSnapshot[]): NumberedAgentRow[] {
  return agents.flatMap((agent, index) => {
    if (!isRecord(agent) || !nonEmptyString(agent.address)) return [];
    return [
      {
        address: agent.address,
        pane: nonEmptyString(agent.pane) ? agent.pane : null,
        number: index + 1,
        status: statusOrUnknown(agent.status),
      },
    ];
  });
}

export function statusColor(theme: Record<string, string>, status: DisplayStatus): string {
  if (status === null) return firstColor(theme.muted, theme.dim, theme.foreground);
  return firstColor(theme[status], theme.unknown, theme.dim, theme.muted, theme.foreground);
}

function firstColor(...colors: unknown[]): string {
  return colors.find((color): color is string => typeof color === "string" && color.length > 0) ?? "";
}

export function spaceSelection(targetId: unknown, currentSpaces: readonly SpaceSnapshot[]): SelectionAction | null {
  if (!nonEmptyString(targetId)) return null;
  let matches = 0;
  for (const space of currentSpaces) {
    if (isRecord(space) && space.id === targetId) matches += 1;
  }
  return matches === 1 ? { command: "space.select", args: { id: targetId } } : null;
}

export function agentSelection(
  target: { address: unknown; pane: unknown },
  currentAgents: readonly AgentSnapshot[],
  currentPanes: readonly PaneSnapshot[],
): SelectionAction | null {
  if (!nonEmptyString(target.address) || !nonEmptyString(target.pane)) return null;

  const currentAgentMatches = currentAgents.filter(
    (agent) => isRecord(agent) && agent.address === target.address && agent.pane === target.pane,
  );
  if (currentAgentMatches.length !== 1) return null;

  const currentPaneMatches = currentPanes.filter(
    (pane) => isRecord(pane) && pane.pane === target.pane && pane.terminal === target.address,
  );
  if (currentPaneMatches.length !== 1) return null;

  return { command: "pane.focus", args: { pane: target.pane } };
}
