import assert from "node:assert/strict";
import test from "node:test";

import {
  FOCUS_DURATIONS_MS,
  advanceFocusClock,
  createFocusClock,
  formatFocusRemaining,
  pauseFocusClock,
  resetFocusClock,
  selectFocusMode,
  studyFocusMinutesFromParam,
  startFocusClock,
} from "../src/features/study/focus-clock";

const make = (mode?: "study" | "rest") => createFocusClock(mode);

test("Mobile focus clock starts idle at 25 minutes and waits for the user", () => {
  const clock = make();
  assert.deepEqual(clock, {
    mode: "study",
    phase: "idle",
    durationMs: 1_500_000,
    remainingMs: 1_500_000,
    deadlineMs: null,
  });
  assert.equal(formatFocusRemaining(clock.remainingMs), "25:00");
  assert.equal(advanceFocusClock(clock, 9_999_999), clock);
});

test("rest interval is five minutes and starts only on explicit action", () => {
  const rest = make("rest");
  assert.equal(FOCUS_DURATIONS_MS.rest, 300_000);
  assert.equal(rest.phase, "idle");
  assert.equal(formatFocusRemaining(rest.remainingMs), "05:00");
  assert.equal(startFocusClock(rest, 100).deadlineMs, 300_100);
});

test("a task can suggest a bounded study duration without starting the clock", () => {
  const clock = createFocusClock("study", 45);
  assert.equal(clock.phase, "idle");
  assert.equal(clock.durationMs, 2_700_000);
  assert.equal(formatFocusRemaining(clock.remainingMs), "45:00");
  assert.deepEqual(resetFocusClock(clock), clock);
  assert.equal(studyFocusMinutesFromParam("45"), 45);
  assert.equal(studyFocusMinutesFromParam(["45"]), 45);
  assert.equal(studyFocusMinutesFromParam(["45", "60"]), null);
  assert.equal(studyFocusMinutesFromParam("47"), null);
  assert.equal(studyFocusMinutesFromParam("125"), null);
});

test("deadline recovers missed ticks without accumulating interval drift", () => {
  const started = startFocusClock(make(), 1_000);
  const tick = advanceFocusClock(started, 31_000);
  assert.equal(tick.remainingMs, 1_470_000);
  assert.equal(formatFocusRemaining(tick.remainingMs), "24:30");
  const done = advanceFocusClock(tick, 1_501_000);
  assert.equal(done.phase, "done");
  assert.equal(formatFocusRemaining(done.remainingMs), "00:00");
});

test("pause freezes time and resume preserves remaining duration", () => {
  const beforePause = startFocusClock(make("rest"), 1_000);
  const paused = pauseFocusClock(beforePause, 61_000);
  assert.equal(paused.phase, "paused");
  assert.equal(paused.deadlineMs, null);
  assert.equal(paused.remainingMs, 240_000);
  assert.equal(advanceFocusClock(paused, 5_000_000), paused);
  const resumed = startFocusClock(paused, 5_000_000);
  assert.equal(resumed.remainingMs, 240_000);
  assert.equal(resumed.deadlineMs, 5_240_000);
  assert.equal(advanceFocusClock(resumed, 5_240_000).phase, "done");
});

test("repeated start and pause actions cannot extend or reset the timer", () => {
  const started = startFocusClock(make(), 200);
  const again = startFocusClock(started, 210);
  assert.equal(again.deadlineMs, started.deadlineMs);
  assert.equal(again.remainingMs, started.remainingMs - 10);
  const paused = pauseFocusClock(again, 220);
  assert.equal(pauseFocusClock(paused, 900), paused);
});

test("completed intervals need an explicit reset and never auto-restart", () => {
  const started = startFocusClock(make("rest"), 500);
  const done = advanceFocusClock(started, 300_500);
  assert.equal(done.phase, "done");
  assert.equal(done.deadlineMs, null);
  assert.equal(startFocusClock(done, 400_000), done);
  assert.equal(pauseFocusClock(done, 400_000), done);
  assert.deepEqual(resetFocusClock(done), make("rest"));
  assert.deepEqual(selectFocusMode("study"), make());
});

test("a backwards wall clock never increases displayed remaining time", () => {
  const started = startFocusClock(make(), 1_000);
  const progressed = advanceFocusClock(started, 61_000);
  const rolledBack = advanceFocusClock(progressed, 20_000);
  assert.equal(rolledBack.remainingMs, progressed.remainingMs);
  assert.equal(rolledBack.deadlineMs, progressed.deadlineMs);
});

test("format rounds up to avoid reporting completion early", () => {
  assert.equal(formatFocusRemaining(1), "00:01");
  assert.equal(formatFocusRemaining(1000), "00:01");
  assert.equal(formatFocusRemaining(1001), "00:02");
  assert.equal(formatFocusRemaining(59_999), "01:00");
  assert.equal(formatFocusRemaining(0), "00:00");
});

test("invalid modes, timestamps, and remaining durations are rejected", () => {
  for (const mode of ["all", "study ", "", null]) {
    assert.throws(() => createFocusClock(mode as never), TypeError);
  }
  for (const minutes of [0, 4, 6, 121, 125, NaN, Infinity, "45"]) {
    assert.throws(
      () => createFocusClock("study", minutes as number),
      TypeError,
    );
  }
  for (const now of [-1, NaN, Infinity, "1000", null]) {
    assert.throws(() => startFocusClock(make(), now as number), TypeError);
    assert.throws(() => advanceFocusClock(make(), now as number), TypeError);
  }
  for (const remainingMs of [-1, NaN, Infinity]) {
    assert.throws(() => formatFocusRemaining(remainingMs), TypeError);
  }
});
