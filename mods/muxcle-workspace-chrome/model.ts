export type PaneAction = "focus" | "split-right" | "split-down" | "zoom" | "close";
export type WorkspaceChromeRole = "pane-footer" | "status-clock";

export function roleFor(value: unknown): WorkspaceChromeRole | null {
  return value === "pane-footer" || value === "status-clock" ? value : null;
}

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

type SpaceSnapshot = {
  machine: string | null;
  branch?: string | null;
  tabs: { id: string }[];
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
