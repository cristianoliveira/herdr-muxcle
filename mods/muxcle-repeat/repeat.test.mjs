import assert from "node:assert/strict";
import test from "node:test";
import { RepeatSession, REPEAT_TIMEOUT_MS, restoreRepeatFocus } from "../../.build/mods/muxcle-repeat/repeat.js";

function sessionHarness() {
  const timers = [];
  let closes = 0;
  const schedule = (ms, callback) => {
    const timer = { ms, callback, cancelled: false };
    timers.push(timer);
    return () => {
      timer.cancelled = true;
    };
  };
  const session = new RepeatSession(() => {
    closes += 1;
  });
  session.arm(schedule);
  return { session, schedule, timers, closes: () => closes };
}

test("repeat mode expires after 1.5 seconds of inactivity", () => {
  const { session, timers, closes } = sessionHarness();

  assert.equal(timers[0].ms, REPEAT_TIMEOUT_MS);
  timers[0].callback();

  assert.equal(closes(), 1);
  assert.equal(session.active, false);
});

test("supported navigation renews the timeout and preserves tab direction", () => {
  const { session, schedule, timers } = sessionHarness();

  assert.deepEqual(session.press("n", schedule), { command: "tab.prev" });
  assert.equal(timers[0].cancelled, true);
  assert.deepEqual(session.press("p", schedule), { command: "tab.next" });
  assert.equal(timers[1].cancelled, true);
  assert.equal(timers.length, 3);
});

test("pane navigation accepts vi keys and only Ctrl+h/j/k/l aliases", () => {
  const { session, schedule } = sessionHarness();

  for (const [key, direction] of [
    ["h", "left"],
    ["j", "down"],
    ["k", "up"],
    ["l", "right"],
  ]) {
    const action = { command: "pane.go", args: { direction } };
    assert.deepEqual(session.press(key, schedule), action);
    assert.deepEqual(session.press(`ctrl-${key}`, schedule), action);
  }
});

test("Escape and unsupported keys exit without dispatching an action", () => {
  for (const key of ["escape", "x", "ctrl-c", "ctrl-n", "ctrl-p", "cmd-q", "shift-n", "constructor"]) {
    const { session, schedule, timers, closes } = sessionHarness();

    assert.equal(session.press(key, schedule), null);
    assert.equal(timers[0].cancelled, true);
    assert.equal(closes(), 1);
    assert.equal(session.press("n", schedule), null);
    assert.equal(closes(), 1);
  }
});

test("a cancelled timeout cannot close a renewed session", () => {
  const { session, schedule, timers, closes } = sessionHarness();

  session.press("n", schedule);
  timers[0].callback();

  assert.equal(session.active, true);
  assert.equal(closes(), 0);
  timers[1].callback();
  assert.equal(session.active, false);
  assert.equal(closes(), 1);
});

test("disposing cancels timers without closing an already removed overlay", () => {
  const { session, schedule, timers, closes } = sessionHarness();

  session.dispose();
  session.dispose();
  timers[0].callback();
  session.press("p", schedule);
  session.arm(schedule);

  assert.equal(timers.length, 1);
  assert.equal(timers[0].cancelled, true);
  assert.equal(closes(), 0);
});

test("focus returns to the popup only while the mode remains active", () => {
  const { session } = sessionHarness();
  let focusCalls = 0;
  const focus = () => {
    focusCalls += 1;
  };

  restoreRepeatFocus(session, focus);
  assert.equal(focusCalls, 1);
  session.dispose();
  restoreRepeatFocus(session, focus);
  assert.equal(focusCalls, 1);
});

test("a synchronously expired timer leaves no active session or live timer", () => {
  let closes = 0;
  let cancellations = 0;
  const session = new RepeatSession(() => {
    closes += 1;
  });

  session.arm((_milliseconds, callback) => {
    callback();
    return () => {
      cancellations += 1;
    };
  });

  assert.equal(session.active, false);
  assert.equal(closes, 1);
  assert.equal(cancellations, 1);
});
