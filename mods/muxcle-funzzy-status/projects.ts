import {
  MAX_CONCURRENT_PROJECTS,
  MAX_PROJECTS,
  MAX_STATUS_TIMEOUT_MS,
  PERSISTED_CURSOR_KEY,
  observeSnapshot,
  parseCapabilities,
  parseStatus,
  persistCursors,
  projectKey,
  projectLabel,
  restoreCursors,
  validIdentity,
  isUnsupportedCli,
  type MonitorValue,
  type ProjectIdentity,
  type WatcherCursor,
} from "./model.js";

export interface ProjectSpace extends ProjectIdentity {
  id: string;
  name: string;
  active: boolean;
}

export interface ExecResult {
  code: number;
  stdout: string;
  stderr: string;
}

export interface ExecOptions {
  cwd?: string;
  on: string | null;
  timeout: number;
}

export interface PaneLocation {
  terminal: string;
  pane: string;
  tab: string;
  name: string;
}

export interface StatusNotification {
  title: string;
  body: string;
  level: "success" | "error";
}

interface ProjectEntry {
  identity: ProjectIdentity;
  value: MonitorValue;
}

interface QueryResult {
  kind: "ok" | "offline" | "invalid" | "unsupported" | "restarting" | "stale";
  snapshot?: { generation: number; state: "idle" | "running" | "passed" | "failed" | "cancelled"; failures: number };
  instance?: string;
}

interface ProjectWatchersOptions {
  spaces: () => ProjectSpace[];
  exec: (command: string, args: string[], options: ExecOptions) => Promise<ExecResult>;
  notify: (notification: StatusNotification) => unknown;
  binary?: string;
  remoteBinary?: string;
  remoteEnabled?: boolean;
  readPersisted?: () => unknown;
  writePersisted?: (key: string, value: unknown) => void;
}

function identityFor(space: ProjectSpace): ProjectIdentity | null {
  const identity = {
    machine: typeof space.machine === "string" && space.machine.length > 0 ? space.machine : null,
    folder: space.folder,
  };
  return validIdentity(identity) ? identity : null;
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

export class ProjectWatchers {
  private readonly spaces: ProjectWatchersOptions["spaces"];
  private readonly exec: ProjectWatchersOptions["exec"];
  private readonly notify: ProjectWatchersOptions["notify"];
  private readonly binary: string;
  private readonly remoteBinary: string;
  private readonly remoteEnabled: boolean;
  private readonly writePersisted: NonNullable<ProjectWatchersOptions["writePersisted"]>;
  private readonly cursors: Map<string, WatcherCursor>;
  private readonly startupBaseline: Set<string>;
  private projects = new Map<string, ProjectEntry>();
  private limited = new Set<string>();
  private polling = false;
  private closed = false;

  constructor(options: ProjectWatchersOptions) {
    this.spaces = options.spaces;
    this.exec = options.exec;
    this.notify = options.notify;
    this.binary = options.binary ?? "fzz";
    this.remoteBinary = options.remoteBinary ?? "fzz";
    this.remoteEnabled = options.remoteEnabled === true;
    this.writePersisted = options.writePersisted ?? (() => {});
    this.cursors = restoreCursors(options.readPersisted?.());
    this.startupBaseline = new Set(this.cursors.keys());
  }

  sync(): void {
    if (this.closed) return;

    const contexts = new Map<string, ProjectIdentity>();
    for (const space of this.spaces()) {
      const identity = identityFor(space);
      if (!identity || (identity.machine && !this.remoteEnabled)) continue;

      const key = projectKey(identity);
      contexts.set(key, identity);
    }

    const ordered = [...contexts.entries()].sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0));
    const allowed = ordered.slice(0, MAX_PROJECTS);
    this.limited = new Set(ordered.slice(MAX_PROJECTS).map(([key]) => key));
    const activeKeys = new Set(allowed.map(([key]) => key));

    for (const key of this.projects.keys()) {
      if (!activeKeys.has(key)) this.projects.delete(key);
    }
    for (const [key, identity] of allowed) {
      if (!this.projects.has(key)) this.projects.set(key, { identity, value: { state: "loading" } });
    }
  }

  current(): MonitorValue {
    this.sync();
    const active = this.spaces().find((space) => space.active);
    if (!active) return { state: "no-project" };

    const identity = identityFor(active);
    if (!identity) return { state: "invalid" };
    if (identity.machine && !this.remoteEnabled) return { state: "remote-disabled" };

    const key = projectKey(identity);
    if (this.limited.has(key)) return { state: "limit" };
    return this.projects.get(key)?.value ?? { state: "loading" };
  }

  hasProjects(): boolean {
    this.sync();
    return this.projects.size > 0;
  }

  close(): void {
    this.closed = true;
    this.projects.clear();
    this.limited.clear();
  }

  async poll(): Promise<void> {
    if (this.closed || this.polling) return;
    this.sync();
    if (this.projects.size === 0) return;

    this.polling = true;
    try {
      const projects = [...this.projects.entries()];
      await forEachLimited(projects, MAX_CONCURRENT_PROJECTS, async ([key, entry]) => {
        if (this.closed || this.projects.get(key) !== entry) return;

        const isCurrent = () => {
          this.sync();
          return !this.closed && this.projects.get(key) === entry;
        };
        const result = await this.query(entry.identity, isCurrent);
        if (!isCurrent() || result.kind === "stale") return;
        if (result.kind !== "ok") {
          entry.value = { state: result.kind };
          return;
        }
        if (!result.snapshot || !result.instance) {
          entry.value = { state: "invalid" };
          return;
        }

        const previous = this.cursors.get(key);
        const observation = observeSnapshot(previous, result.snapshot, result.instance, this.startupBaseline.has(key));
        if (observation.invalid) {
          entry.value = { state: "invalid" };
          return;
        }

        this.startupBaseline.delete(key);
        this.storeCursor(key, observation.cursor);
        entry.value = result.snapshot;
        if (observation.notify) this.sendNotification(entry, result.snapshot);
      });
    } finally {
      this.polling = false;
    }
  }

  private async query(identity: ProjectIdentity, isCurrent: () => boolean): Promise<QueryResult> {
    const binary = identity.machine ? this.remoteBinary : this.binary;
    const options: ExecOptions = {
      on: identity.machine,
      timeout: MAX_STATUS_TIMEOUT_MS,
    };
    // The native exec API uses the target machine's home when cwd is omitted.
    // Never infer a remote home from the local user's HOME.
    if (identity.folder) options.cwd = identity.folder;

    const run = async (
      action: "capabilities" | "status",
    ): Promise<{ kind: "ok"; stdout: string } | { kind: "offline" | "invalid" | "unsupported" | "stale" }> => {
      let result: ExecResult;
      try {
        result = await this.exec(binary, ["control", "--format", "json", action], options);
      } catch {
        return { kind: isCurrent() ? "offline" : "stale" };
      }
      if (!isCurrent()) return { kind: "stale" };
      if (!result || typeof result.code !== "number" || typeof result.stdout !== "string") {
        return { kind: "invalid" };
      }
      if (result.code !== 0) return { kind: isUnsupportedCli(result.stderr) ? "unsupported" : "offline" };
      return { kind: "ok", stdout: result.stdout };
    };

    const beforeResult = await run("capabilities");
    if (beforeResult.kind !== "ok") return beforeResult;
    const before = parseCapabilities(beforeResult.stdout);
    if (before.kind !== "ok") return { kind: before.kind };

    const statusResult = await run("status");
    if (statusResult.kind !== "ok") return statusResult;
    const status = parseStatus(statusResult.stdout);
    if (status.kind !== "ok") return { kind: "invalid" };

    // Status documents do not carry an instance token. Bracket the snapshot
    // with capabilities so a watcher restart cannot pair two instances.
    const afterResult = await run("capabilities");
    if (afterResult.kind !== "ok") return afterResult;
    const after = parseCapabilities(afterResult.stdout);
    if (after.kind !== "ok") return { kind: after.kind };
    if (before.value.instance !== after.value.instance) return { kind: "restarting" };

    return { kind: "ok", snapshot: status.value, instance: before.value.instance };
  }

  private storeCursor(key: string, cursor: WatcherCursor): void {
    this.cursors.delete(key);
    this.cursors.set(key, cursor);
    while (this.cursors.size > MAX_PROJECTS) {
      const oldest = this.cursors.keys().next().value;
      if (oldest === undefined) break;
      this.cursors.delete(oldest);
    }
    try {
      this.writePersisted(PERSISTED_CURSOR_KEY, persistCursors(this.cursors));
    } catch {
      // Keep the in-memory cursor even when app state cannot be persisted.
    }
  }

  private sendNotification(entry: ProjectEntry, snapshot: { generation: number; state: string }): void {
    try {
      this.notify({
        title: "Funzzy watcher",
        body: `Run #${snapshot.generation} ${snapshot.state} · ${projectLabel(entry.identity)}`,
        level: snapshot.state === "failed" ? "error" : "success",
      });
    } catch {
      // Observation is already persisted; a failed desktop toast is not retried.
    }
  }
}
