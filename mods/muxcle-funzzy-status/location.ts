import { MAX_CONCURRENT_PROJECTS } from "./model.js";
import type { ExecOptions, ExecResult, PaneLocation, ProjectSpace } from "./projects.js";

export const MAX_LOCATION_TARGETS = 32;
export const MAX_LOCATION_TIMEOUT_MS = 3000;
export const MAX_LOCATION_JSON_LENGTH = 65_536;

interface TabReference {
  id: string;
  name: string;
}

interface SpaceReference extends ProjectSpace {
  tabs: TabReference[];
}

interface PaneReference {
  pane: string;
  terminal: string | null;
  tab: string;
}

interface WatcherTarget {
  pane: string;
  terminal: string;
  folder: string;
  tab: TabReference;
}

interface TerminalDetails {
  address?: unknown;
  state?: unknown;
  foreground?: unknown;
}

interface WatcherLocationOptions {
  spaces: () => SpaceReference[];
  panes: () => PaneReference[];
  exec: (command: string, args: string[], options: ExecOptions) => Promise<ExecResult>;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

export function matchesWatcherProcess(value: unknown, target: WatcherTarget): boolean {
  if (!isRecord(value)) return false;
  const foreground = value.foreground;
  if (value.state !== "live" || value.address !== target.terminal || !isRecord(foreground)) return false;
  if (foreground.cwd !== target.folder || !Array.isArray(foreground.argv)) return false;

  const argv = foreground.argv;
  const command =
    typeof argv[0] === "string"
      ? argv[0]
          .split(/[\\/]/)
          .pop()
          ?.toLowerCase()
          .replace(/\.exe$/, "")
      : "";
  return (command === "fzz" || command === "funzzy") && (argv.length === 1 || argv[1] === "watch");
}

async function forEachLimited<T>(items: T[], limit: number, visit: (item: T) => Promise<void>): Promise<void> {
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      const item = items[next];
      next += 1;
      await visit(item);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
}

export class WatcherLocations {
  private readonly spaces: WatcherLocationOptions["spaces"];
  private readonly panes: WatcherLocationOptions["panes"];
  private readonly exec: WatcherLocationOptions["exec"];
  private locations = new Map<string, PaneLocation[]>();
  private refreshing = false;
  private closed = false;
  private truncated = false;

  constructor(options: WatcherLocationOptions) {
    this.spaces = options.spaces;
    this.panes = options.panes;
    this.exec = options.exec;
  }

  targets(): WatcherTarget[] {
    const tabs = new Map<string, { folder: string; tab: TabReference }>();
    for (const space of this.spaces()) {
      // Remote panes have no local process metadata. Empty folder means the
      // machine's home; without its absolute path it cannot be an exact hint.
      if (space.machine || !space.folder) continue;
      for (const tab of space.tabs) tabs.set(tab.id, { folder: space.folder, tab });
    }

    const targets: WatcherTarget[] = [];
    for (const pane of this.panes()) {
      if (!pane.terminal) continue;
      const tab = tabs.get(pane.tab);
      if (!tab) continue;
      targets.push({ pane: pane.pane, terminal: pane.terminal, ...tab });
    }
    return targets;
  }

  forFolder(folder: string): PaneLocation[] {
    const live = this.targets();
    return (this.locations.get(folder) ?? []).filter((location) =>
      live.some(
        (target) =>
          target.folder === folder &&
          target.pane === location.pane &&
          target.terminal === location.terminal &&
          target.tab.id === location.tab,
      ),
    );
  }

  unique(folder: string): PaneLocation | null {
    if (this.truncated) return null;
    const matches = this.forFolder(folder);
    return matches.length === 1 ? matches[0] : null;
  }

  close(): void {
    this.closed = true;
    this.locations.clear();
  }

  private isLiveTarget(candidate: WatcherTarget): boolean {
    return this.targets().some(
      (target) =>
        target.terminal === candidate.terminal &&
        target.pane === candidate.pane &&
        target.tab.id === candidate.tab.id &&
        target.folder === candidate.folder,
    );
  }

  async refresh(): Promise<void> {
    if (this.closed || this.refreshing) return;
    this.refreshing = true;
    try {
      const targets = this.targets();
      this.truncated = targets.length > MAX_LOCATION_TARGETS;
      const boundedTargets = targets.slice(0, MAX_LOCATION_TARGETS);
      const matches: WatcherTarget[] = [];
      await forEachLimited(boundedTargets, MAX_CONCURRENT_PROJECTS, async (target) => {
        if (this.closed || !this.isLiveTarget(target)) return;
        let result: ExecResult;
        try {
          const options: ExecOptions = { on: null, timeout: MAX_LOCATION_TIMEOUT_MS };
          result = await this.exec("hc", ["get", target.terminal, "--json"], options);
        } catch {
          return;
        }
        if (
          this.closed ||
          !this.isLiveTarget(target) ||
          result.code !== 0 ||
          result.stdout.length > MAX_LOCATION_JSON_LENGTH
        )
          return;

        let details: TerminalDetails;
        try {
          details = JSON.parse(result.stdout) as TerminalDetails;
        } catch {
          return;
        }
        if (matchesWatcherProcess(details, target)) matches.push(target);
      });

      if (this.closed) return;
      const live = this.targets();
      const grouped = new Map<string, PaneLocation[]>();
      for (const match of matches) {
        const target = live.find(
          (item) =>
            item.terminal === match.terminal &&
            item.pane === match.pane &&
            item.tab.id === match.tab.id &&
            item.folder === match.folder,
        );
        if (!target) continue;

        const locations = grouped.get(target.folder) ?? [];
        locations.push({
          terminal: target.terminal,
          pane: target.pane,
          tab: target.tab.id,
          name: target.tab.name,
        });
        grouped.set(target.folder, locations);
      }
      this.locations = grouped;
    } finally {
      this.refreshing = false;
    }
  }
}
