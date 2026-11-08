export type KeyAction = string | { command: string; args?: Record<string, unknown> };
export type Keymap = Record<string, unknown>;

export interface KeyConflict {
  chord: string;
  existingSection: string;
  incomingSection: string;
  existingAction: KeyAction;
  incomingAction: KeyAction;
  reason: "exact" | "shadowed-by-existing" | "overrides-existing";
}

export interface KeymapMergePlan {
  merged: Keymap | null;
  conflicts: KeyConflict[];
  added: number;
  unchanged: number;
}

const PACKAGE_SECTIONS = new Set(["global", "terminal"]);

/** Plan a manual-safe merge for this package's global and terminal bindings. */
export function planKeymapMerge(existingValue: unknown, additionsValue: unknown): KeymapMergePlan {
  const existing = validateKeymap(existingValue, "existing key map", true);
  const additions = validateKeymap(additionsValue, "package key snippet", false);
  const merged = cloneJson(existing);
  const conflicts: KeyConflict[] = [];
  let added = 0;
  let unchanged = 0;

  const orderedSections = Object.entries(additions).sort(
    ([left], [right]) => sectionPriority(left) - sectionPriority(right),
  );
  for (const [incomingSection, value] of orderedSections) {
    if (!isKeySection(incomingSection)) continue;
    const incomingBindings = value as Record<string, KeyAction>;
    const target = (merged[incomingSection] ?? {}) as Record<string, KeyAction>;

    for (const [chord, incomingAction] of Object.entries(incomingBindings)) {
      const exactAction = target[chord];
      if (exactAction !== undefined) {
        if (actionsEqual(exactAction, incomingAction)) {
          unchanged += 1;
          conflicts.push(...findPrecedenceOverlaps(merged, incomingSection, chord, incomingAction));
          continue;
        }
        conflicts.push({
          chord,
          existingSection: incomingSection,
          incomingSection,
          existingAction: exactAction,
          incomingAction,
          reason: "exact",
        });
        continue;
      }

      const overlaps = findPrecedenceOverlaps(merged, incomingSection, chord, incomingAction);
      conflicts.push(...overlaps);
      if (overlaps.length > 0) continue;

      Object.defineProperty(target, chord, {
        value: incomingAction,
        enumerable: true,
        configurable: true,
        writable: true,
      });
      Object.defineProperty(merged, incomingSection, {
        value: target,
        enumerable: true,
        configurable: true,
        writable: true,
      });
      added += 1;
    }
  }

  return { merged: conflicts.length === 0 ? merged : null, conflicts, added, unchanged };
}

function validateKeymap(value: unknown, label: string, allowMetadata: boolean): Keymap {
  if (!isRecord(value)) throw new TypeError(`${label} must be a JSON object`);

  for (const [section, bindings] of Object.entries(value)) {
    if (!isKeySection(section)) {
      if (section.startsWith("layout:") || section.startsWith("mod:")) {
        throw new TypeError(`${label} has an empty key section name: ${section}`);
      }
      if (allowMetadata) continue;
      throw new TypeError(`${label} contains unsupported section: ${section}`);
    }
    if (!allowMetadata && !PACKAGE_SECTIONS.has(section)) {
      throw new TypeError(`${label} contains unsupported section: ${section}`);
    }
    if (!isRecord(bindings)) throw new TypeError(`${label} section ${section} must be an object`);

    for (const [chord, action] of Object.entries(bindings)) {
      if (!chord.trim()) throw new TypeError(`${label} section ${section} has an empty key chord`);
      validateAction(action, `${label} section ${section} chord ${chord}`);
    }
  }
  return value;
}

function validateAction(value: unknown, label: string): asserts value is KeyAction {
  if (typeof value === "string" && value.trim() !== "") return;
  if (typeof value === "string") throw new TypeError(`${label} action must not be empty`);
  if (!isRecord(value)) throw new TypeError(`${label} action must be a string or command object`);
  if (Object.keys(value).some((key) => key !== "command" && key !== "args")) {
    throw new TypeError(`${label} command object may contain only command and args`);
  }
  if (typeof value.command !== "string" || value.command.trim() === "") {
    throw new TypeError(`${label} command object requires a non-empty command`);
  }
  if (value.args !== undefined && !isRecord(value.args)) {
    throw new TypeError(`${label} command args must be an object`);
  }
}

function findPrecedenceOverlaps(
  keymap: Keymap,
  incomingSection: string,
  chord: string,
  incomingAction: KeyAction,
): KeyConflict[] {
  const incomingPriority = sectionPriority(incomingSection);
  if (incomingPriority === 0 || incomingPriority === 2) {
    const conflicts: KeyConflict[] = [];
    for (const [existingSection, value] of Object.entries(keymap)) {
      if (existingSection === incomingSection || !isScopedSection(existingSection)) continue;
      const existingPriority = sectionPriority(existingSection);
      const existingBindings = value as Record<string, KeyAction>;
      const existingAction = existingBindings[chord];
      if (existingAction === undefined || actionsEqual(existingAction, incomingAction)) continue;

      const shadowsIncoming = existingPriority > incomingPriority;
      if (shadowsIncoming !== (incomingSection === "global")) continue;
      conflicts.push({
        chord,
        existingSection,
        incomingSection,
        existingAction,
        incomingAction,
        reason: shadowsIncoming ? "shadowed-by-existing" : "overrides-existing",
      });
    }
    return conflicts;
  }
  return [];
}

function isKeySection(section: string): boolean {
  if (PACKAGE_SECTIONS.has(section)) return true;
  if (section.startsWith("layout:")) return section.slice("layout:".length).trim() !== "";
  if (section.startsWith("mod:")) return section.slice("mod:".length).trim() !== "";
  return false;
}

function isScopedSection(section: string): boolean {
  return section === "global" || section === "terminal" || section.startsWith("layout:");
}

function sectionPriority(section: string): number {
  if (section === "global") return 0;
  if (section.startsWith("layout:")) return 1;
  if (section === "terminal") return 2;
  return 3;
}

function actionsEqual(left: KeyAction, right: KeyAction): boolean {
  return canonicalJson(left) === canonicalJson(right);
}

function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (isRecord(value)) {
    const fields = Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`);
    return `{${fields.join(",")}}`;
  }
  return JSON.stringify(value) ?? "undefined";
}

function cloneJson<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
