import { isSafeHomeRelativeRoot, MAX_ROOT_PATH_CHARS, projectKey, type Project } from "./model.js";

export const PROJECT_CACHE_TTL_MS = 60_000;
export const MAX_PROJECT_CACHE_ENTRIES = 13;
export const MAX_PROJECT_CACHE_BYTES = 512 * 1024;
export const MAX_PARALLEL_SCANS = 4;

export interface ConnectedMachine {
  id: string;
  name: string;
}

export interface CachedProjectSet {
  machine: string | null;
  machineId: string | null;
  roots: string[];
  updatedAt: number;
  projects: { name: string; path: string }[];
  warnings: string[];
  truncated: boolean;
}

export interface PublishedProjects {
  projects: Project[];
  warnings: string[];
  truncated: boolean;
  loading: boolean;
}

export function restoreProjectCache(value: unknown): CachedProjectSet[] {
  if (
    !isRecord(value) ||
    value.version !== 2 ||
    !Array.isArray(value.entries) ||
    value.entries.length > MAX_PROJECT_CACHE_ENTRIES
  )
    return [];
  try {
    if (utf8Length(JSON.stringify(value)) > MAX_PROJECT_CACHE_BYTES) return [];
  } catch {
    return [];
  }
  const entries: CachedProjectSet[] = [];
  const seen = new Set<string>();
  for (const item of value.entries) {
    if (
      !isRecord(item) ||
      !(item.machine === null || validMachine(item.machine)) ||
      !(item.machineId === null || validMachine(item.machineId)) ||
      (item.machine === null) !== (item.machineId === null) ||
      !Array.isArray(item.roots) ||
      item.roots.length > 12 ||
      !item.roots.every(validRoot) ||
      !Number.isFinite(item.updatedAt) ||
      !Array.isArray(item.projects) ||
      item.projects.length > 500 ||
      !Array.isArray(item.warnings) ||
      item.warnings.length > 12 ||
      typeof item.truncated !== "boolean"
    )
      continue;
    const key = item.machineId ?? "local";
    if (
      seen.has(key) ||
      !item.projects.every(validProject) ||
      !item.warnings.every((warning) => typeof warning === "string" && warning.length <= 2048)
    )
      continue;
    seen.add(key);
    entries.push({
      machine: item.machine as string | null,
      machineId: item.machineId as string | null,
      roots: item.roots as string[],
      updatedAt: item.updatedAt as number,
      projects: item.projects as CachedProjectSet["projects"],
      warnings: item.warnings as string[],
      truncated: item.truncated,
    });
  }
  return entries;
}

export async function refreshProjects(options: {
  cache: CachedProjectSet[];
  roots: Readonly<Record<string, readonly string[]>>;
  connectedMachines: readonly ConnectedMachine[];
  now?: () => number;
  scan: (
    machine: string | null,
    roots: readonly string[],
  ) => Promise<{ projects: { name: string; path: string }[]; warnings: string[]; truncated: boolean }>;
  publish: (state: PublishedProjects) => void;
  persist: (entry: CachedProjectSet) => void;
}): Promise<void> {
  const now = options.now ?? Date.now;
  const currentMachines = new Map(options.connectedMachines.map((machine) => [machine.name, machine]));
  const targets: { machine: string | null; machineId: string | null; roots: readonly string[] }[] = [];
  if ((options.roots[""]?.length ?? 0) > 0) targets.push({ machine: null, machineId: null, roots: options.roots[""] });
  for (const machine of Object.keys(options.roots).filter(Boolean).sort(compareText)) {
    if (options.roots[machine].length === 0) continue;
    const connected = currentMachines.get(machine);
    if (connected) targets.push({ machine, machineId: connected.id, roots: options.roots[machine] });
  }

  const compatibleCache = options.cache.filter((entry) => {
    const configuredRoots = entry.machine === null ? options.roots[""] : options.roots[entry.machine];
    return configuredRoots !== undefined && sameRoots(configuredRoots, entry.roots);
  });
  const entries = new Map(compatibleCache.map((entry) => [entry.machineId ?? "local", entry]));
  const errors = new Map<string, string>();
  for (const machine of Object.keys(options.roots).filter(Boolean)) {
    const cached = compatibleCache.find((entry) => entry.machine === machine);
    const current = currentMachines.get(machine);
    if (!current) {
      errors.set(
        cached?.machineId ?? machine,
        `${machine}: disconnected${cached ? " (cached projects are stale)" : ""}`,
      );
    } else if (cached && cached.machineId !== current.id) {
      errors.set(cached.machineId ?? machine, `${machine}: native machine identity changed; cached projects are stale`);
    }
  }

  const stale = new Set<string>();
  const pending = targets.filter(({ machineId }) => {
    const key = machineId ?? "local";
    const cached = entries.get(key);
    if (cached && now() - cached.updatedAt >= 0 && now() - cached.updatedAt < PROJECT_CACHE_TTL_MS) return false;
    if (cached) stale.add(key);
    return true;
  });
  let remaining = pending.length;
  const publish = () => {
    const projectSets: Project[][] = [];
    const warnings: string[] = [];
    let truncated = false;
    for (const target of targets) {
      const key = target.machineId ?? "local";
      const cached = entries.get(key);
      if (cached) {
        projectSets.push(projectsFor(cached, stale.has(key)));
        warnings.push(
          ...cached.warnings.map((warning) => (target.machine === null ? warning : `${target.machine}: ${warning}`)),
        );
        truncated ||= cached.truncated;
      }
    }
    for (const cached of compatibleCache) {
      const current = cached.machine === null ? null : currentMachines.get(cached.machine);
      const identityUnavailable = cached.machine !== null && (!current || current.id !== cached.machineId);
      if (cached.machine !== null && options.roots[cached.machine]?.length && identityUnavailable) {
        projectSets.push(projectsFor(cached, true));
        warnings.push(...cached.warnings.map((warning) => `${cached.machine}: ${warning}`));
        truncated ||= cached.truncated;
      }
    }
    warnings.push(...errors.values());
    const totalProjects = projectSets.reduce((total, projects) => total + projects.length, 0);
    truncated ||= totalProjects > 500;
    const visibleWarnings = warnings.slice(0, 35);
    if (warnings.length > visibleWarnings.length) visibleWarnings.push("Additional machine and root warnings omitted.");
    options.publish({
      projects: interleaveProjects(projectSets, 500),
      warnings: visibleWarnings,
      truncated,
      loading: remaining > 0,
    });
  };
  publish();

  let next = 0;
  const worker = async () => {
    while (next < pending.length) {
      const target = pending[next++];
      const key = target.machineId ?? "local";
      try {
        const result = await options.scan(target.machine, target.roots);
        if (!validResult(result)) throw new Error("invalid discovery result");
        const entry: CachedProjectSet = { ...target, roots: [...target.roots], updatedAt: now(), ...result };
        entries.set(key, entry);
        stale.delete(key);
        errors.delete(key);
        try {
          options.persist(entry);
        } catch {
          errors.set(key, `${target.machine ?? "local"}: projects refreshed but cache could not be saved`);
        }
      } catch {
        stale.add(key);
        errors.set(
          key,
          `${target.machine ?? "local"}: refresh failed${entries.has(key) ? "; cached projects retained as stale" : ""}`,
        );
      }
      remaining--;
      publish();
    }
  };
  await Promise.all(Array.from({ length: Math.min(MAX_PARALLEL_SCANS, pending.length) }, worker));
}

function projectsFor(entry: CachedProjectSet, stale: boolean): Project[] {
  return entry.projects.map((project) => ({
    ...project,
    machine: entry.machine,
    machineId: entry.machineId,
    stale,
    key: projectKey(entry.machineId, entry.machine, project.path),
  }));
}

function interleaveProjects(groups: readonly Project[][], limit: number): Project[] {
  const projects: Project[] = [];
  for (let index = 0; projects.length < limit; index++) {
    let found = false;
    for (const group of groups) {
      if (group[index]) {
        projects.push(group[index]);
        found = true;
        if (projects.length === limit) break;
      }
    }
    if (!found) break;
  }
  return projects;
}

function sameRoots(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((root, index) => root === right[index]);
}

function validResult(
  value: unknown,
): value is { projects: { name: string; path: string }[]; warnings: string[]; truncated: boolean } {
  return (
    isRecord(value) &&
    Array.isArray(value.projects) &&
    value.projects.length <= 500 &&
    value.projects.every(validProject) &&
    Array.isArray(value.warnings) &&
    value.warnings.length <= 12 &&
    value.warnings.every((warning) => typeof warning === "string" && warning.length <= 2048) &&
    typeof value.truncated === "boolean"
  );
}

function validProject(value: unknown): value is { name: string; path: string } {
  return (
    isRecord(value) &&
    typeof value.name === "string" &&
    value.name.length > 0 &&
    value.name.length <= 1024 &&
    typeof value.path === "string" &&
    value.path.length > 0 &&
    value.path.length <= 4096 &&
    !value.path.includes("\0") &&
    isAbsolutePath(value.path)
  );
}

function validRoot(value: unknown): value is string {
  if (typeof value !== "string" || value.includes("\0")) return false;
  if (value.startsWith("~/")) {
    return value.length <= MAX_ROOT_PATH_CHARS + 2 && isSafeHomeRelativeRoot(value.slice(2));
  }
  return value.length > 0 && value.length <= MAX_ROOT_PATH_CHARS && isAbsolutePath(value);
}

function validMachine(value: unknown): value is string {
  return typeof value === "string" && value.length > 0 && value.length <= 256 && !/[\u0000-\u001f\u007f]/.test(value);
}

function isAbsolutePath(path: string): boolean {
  return path.startsWith("/") || path.startsWith("\\\\") || /^[A-Za-z]:[\\/]/.test(path);
}

function utf8Length(value: string): number {
  let length = 0;
  for (const character of value) {
    const codePoint = character.codePointAt(0) ?? 0;
    length += codePoint <= 0x7f ? 1 : codePoint <= 0x7ff ? 2 : codePoint <= 0xffff ? 3 : 4;
  }
  return length;
}

function compareText(left: string, right: string): number {
  const a = left.toLowerCase();
  const b = right.toLowerCase();
  return a < b ? -1 : a > b ? 1 : left < right ? -1 : left > right ? 1 : 0;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
