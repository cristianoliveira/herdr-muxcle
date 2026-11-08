export const MAX_CONFIG_CHARS = 16_384;
export const MAX_ROOTS = 12;
export const MAX_ROOT_PATH_CHARS = 2_048;
export const MAX_QUERY_CHARS = 256;
export const MAX_PROJECTS = 500;
export const MAX_HELPER_OUTPUT_CHARS = 512 * 1024;

export class SessionizerError extends Error {}

export type SessionizerConfigResult =
  | { kind: "missing" }
  | { kind: "empty" }
  | { kind: "invalid"; message: string }
  | { kind: "ready"; roots: string[] };

export interface Project {
  key: string;
  name: string;
  path: string;
}

export interface ProjectDiscovery {
  projects: Project[];
  warnings: string[];
  truncated: boolean;
}

export type SpaceMatchResult =
  | { kind: "match"; spaceId: string | null }
  | { kind: "folder-missing" };

export interface SpaceReference {
  id: string;
  folder: string;
  machine: string | null;
  active: boolean;
}

export function parseSessionizerConfig(raw: string | null): SessionizerConfigResult {
  if (raw === null) return { kind: "missing" };
  if (raw.length > MAX_CONFIG_CHARS) {
    return { kind: "invalid", message: "The config is too large. Keep it under 16 KiB." };
  }

  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return { kind: "invalid", message: "The config is not valid JSON." };
  }

  if (!isRecord(value) || Object.keys(value).some((key) => key !== "roots")) {
    return { kind: "invalid", message: "The config must be an object with only a roots array." };
  }
  if (!Array.isArray(value.roots) || value.roots.length > MAX_ROOTS) {
    return { kind: "invalid", message: `Set roots to an array of at most ${MAX_ROOTS} paths.` };
  }

  const roots: string[] = [];
  for (const entry of value.roots) {
    if (typeof entry !== "string") {
      return { kind: "invalid", message: "Every root must be an absolute path string." };
    }
    const root = entry.trim();
    if (root.length === 0 || root.length > MAX_ROOT_PATH_CHARS || root.includes("\0") || !isAbsolutePath(root)) {
      return { kind: "invalid", message: "Every root must be a non-empty absolute path under 2 KiB." };
    }
    roots.push(root);
  }

  return roots.length === 0 ? { kind: "empty" } : { kind: "ready", roots };
}

export function parseProjectDiscovery(raw: string): ProjectDiscovery {
  if (raw.length > MAX_HELPER_OUTPUT_CHARS) {
    throw new SessionizerError("Project discovery returned too much data. Narrow the configured roots.");
  }

  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    throw new SessionizerError("Project discovery returned invalid data.");
  }

  if (!isRecord(value)
    || !Array.isArray(value.projects)
    || !Array.isArray(value.warnings)
    || typeof value.truncated !== "boolean"
    || value.projects.length > MAX_PROJECTS
    || value.warnings.length > MAX_ROOTS) {
    throw new SessionizerError("Project discovery returned invalid data.");
  }

  const projects: Project[] = [];
  const seen = new Set<string>();
  for (const entry of value.projects) {
    if (!isRecord(entry)
      || typeof entry.name !== "string"
      || typeof entry.path !== "string"
      || entry.name.length === 0
      || entry.name.length > 1_024
      || entry.path.length === 0
      || entry.path.length > 4_096
      || entry.path.includes("\0")
      || !isAbsolutePath(entry.path)) {
      throw new SessionizerError("Project discovery returned invalid data.");
    }

    const identity = pathIdentity(entry.path);
    if (seen.has(identity)) continue;
    seen.add(identity);
    projects.push({ key: `project-${projects.length}`, name: entry.name, path: entry.path });
  }

  const warnings: string[] = [];
  for (const warning of value.warnings) {
    if (typeof warning !== "string" || warning.length > MAX_ROOT_PATH_CHARS) {
      throw new SessionizerError("Project discovery returned invalid data.");
    }
    warnings.push(warning);
  }

  return { projects, warnings, truncated: value.truncated };
}

export function parseSpaceMatch(raw: string): SpaceMatchResult {
  if (raw.length > 8_192) throw new SessionizerError("Space lookup returned invalid data.");

  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    throw new SessionizerError("Space lookup returned invalid data.");
  }

  if (!isRecord(value)) throw new SessionizerError("Space lookup returned invalid data.");
  if (value.error === "folder_missing" && value.spaceId === null) return { kind: "folder-missing" };
  if (value.error !== undefined
    || (value.spaceId !== null && (typeof value.spaceId !== "string" || value.spaceId.length === 0 || value.spaceId.length > 512))) {
    throw new SessionizerError("Space lookup returned invalid data.");
  }
  return { kind: "match", spaceId: value.spaceId as string | null };
}

export function filterProjects(projects: readonly Project[], rawQuery: string): Project[] {
  const query = rawQuery.slice(0, MAX_QUERY_CHARS).trim().toLowerCase();
  if (query.length === 0) return [...projects];

  const terms = query.split(/\s+/).filter(Boolean);
  return projects
    .map((project, order) => ({ project, order, score: scoreProject(project, terms) }))
    .filter((entry): entry is { project: Project; order: number; score: number } => entry.score !== null)
    .sort((left, right) => left.score - right.score || compareText(left.project.name, right.project.name)
      || compareText(left.project.path, right.project.path) || left.order - right.order)
    .map(({ project }) => project);
}

export function sameLocalSpaceSnapshot(
  before: readonly SpaceReference[],
  after: readonly SpaceReference[],
): boolean {
  const localKey = (spaces: readonly SpaceReference[]) => spaces
    .filter((space) => space.machine === null)
    .map((space) => `${space.id}\0${space.folder}`)
    .sort(compareText);
  const beforeLocal = localKey(before);
  const afterLocal = localKey(after);
  return beforeLocal.length === afterLocal.length
    && beforeLocal.every((entry, index) => entry === afterLocal[index]);
}

export function safeDisplayText(value: string): string {
  return value.replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim();
}

function scoreProject(project: Project, terms: readonly string[]): number | null {
  const name = project.name.toLowerCase();
  const path = project.path.toLowerCase();
  let score = 0;

  for (const term of terms) {
    const nameScore = scoreText(name, term);
    const pathScore = scorePath(path, term);
    if (nameScore === null && pathScore === null) return null;
    score += Math.min(nameScore ?? Number.POSITIVE_INFINITY, pathScore === null ? Number.POSITIVE_INFINITY : pathScore + 20);
  }
  return score;
}

function scorePath(text: string, query: string): number | null {
  if (text === query) return 0;
  if (text.startsWith(query)) return 1;
  const substring = text.indexOf(query);
  return substring < 0 ? null : 2 + substring / 1_000;
}

function scoreText(text: string, query: string): number | null {
  if (text === query) return 0;
  if (text.startsWith(query)) return 1;
  const substring = text.indexOf(query);
  if (substring >= 0) return 2 + substring / 1_000;

  let position = -1;
  let gaps = 0;
  for (const character of query) {
    const next = text.indexOf(character, position + 1);
    if (next < 0) return null;
    if (position >= 0) gaps += next - position - 1;
    position = next;
  }
  return 10 + gaps + position / 1_000;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isAbsolutePath(path: string): boolean {
  return path.startsWith("/") || path.startsWith("\\\\") || /^[A-Za-z]:[\\/]/.test(path);
}

function pathIdentity(path: string): string {
  const normalized = path.replace(/\\/g, "/").replace(/\/+$/, "") || "/";
  return /^[A-Za-z]:\//.test(normalized) || normalized.startsWith("//")
    ? normalized.toLowerCase()
    : normalized;
}

function compareText(left: string, right: string): number {
  const a = left.toLowerCase();
  const b = right.toLowerCase();
  return a < b ? -1 : a > b ? 1 : left < right ? -1 : left > right ? 1 : 0;
}
