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

export function pickerRows(spaces: readonly PickerSpace[], query: string): PickerRow[] {
  const letters = [...query.slice(0, 256).toLowerCase().replace(/\s+/g, "")];
  return spaces
    .flatMap((space): PickerRow[] => {
      if (space.tabs.length === 0) {
        return [
          {
            key: JSON.stringify(["space", space.id]),
            kind: "space",
            id: space.id,
            label: space.name,
            machine: space.machine,
            active: space.active,
          },
        ];
      }
      return space.tabs.map((tab) => ({
        key: JSON.stringify(["tab", space.id, tab.id]),
        kind: "tab",
        id: tab.id,
        label: `${space.name} → ${tab.name}`,
        machine: space.machine,
        active: space.active && tab.active,
      }));
    })
    .filter((row) => matches(row.label, letters));
}

export function selectedRowKey(rows: readonly PickerRow[], previous: string | null): string | null {
  return rows.find((row) => row.key === previous)?.key ?? rows.find((row) => row.active)?.key ?? rows[0]?.key ?? null;
}

export function selectionAction(spaces: readonly PickerSpace[], query: string, key: string): PickerAction | null {
  const row = pickerRows(spaces, query).find((entry) => entry.key === key);
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
