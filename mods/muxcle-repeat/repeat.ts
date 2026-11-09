export const REPEAT_TIMEOUT_MS = 1500;

export type RepeatAction =
  | { command: "tab.prev" }
  | { command: "tab.next" }
  | { command: "pane.go"; args: { direction: "left" | "down" | "up" | "right" } };

export type RepeatSchedule = (milliseconds: number, callback: () => void) => () => void;

const PANE_DIRECTIONS = new Map<string, "left" | "down" | "up" | "right">([
  ["h", "left"],
  ["j", "down"],
  ["k", "up"],
  ["l", "right"],
] as const);

export function repeatAction(key: string): RepeatAction | null {
  if (key === "n") return { command: "tab.prev" };
  if (key === "p") return { command: "tab.next" };

  const paneKey = key.startsWith("ctrl-") ? key.slice("ctrl-".length) : key;
  const direction = PANE_DIRECTIONS.get(paneKey);
  return direction ? { command: "pane.go", args: { direction } } : null;
}

export class RepeatSession {
  active = true;
  private cancelTimer: (() => void) | null = null;
  private timerGeneration = 0;

  constructor(private readonly close: () => void) {}

  arm(schedule: RepeatSchedule): void {
    if (!this.active) return;

    this.cancelTimer?.();
    this.cancelTimer = null;
    const generation = ++this.timerGeneration;
    const cancel = schedule(REPEAT_TIMEOUT_MS, () => {
      if (!this.active || generation !== this.timerGeneration) return;
      this.cancelTimer = null;
      this.finish();
    });

    if (!this.active || generation !== this.timerGeneration) {
      cancel();
      return;
    }
    this.cancelTimer = cancel;
  }

  press(key: string, schedule: RepeatSchedule): RepeatAction | null {
    if (!this.active) return null;

    const action = repeatAction(key);
    if (!action) {
      this.finish();
      return null;
    }

    this.arm(schedule);
    return action;
  }

  finish(): void {
    if (!this.active) return;
    this.dispose();
    this.close();
  }

  dispose(): void {
    if (!this.active) return;
    this.active = false;
    this.timerGeneration += 1;
    const cancel = this.cancelTimer;
    this.cancelTimer = null;
    cancel?.();
  }
}

export function restoreRepeatFocus(session: RepeatSession | undefined, focus: () => void): void {
  if (!session?.active) return;
  focus();
}
