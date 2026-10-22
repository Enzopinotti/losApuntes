import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  FOCUS_DURATIONS_MS,
  advanceFocusClock,
  createFocusClock,
  formatFocusRemaining,
  pauseFocusClock,
  resetFocusClock,
  selectFocusMode,
  startFocusClock,
} from "../apps/web/src/features/study/study-focus-clock.mjs";

const make = (mode) => createFocusClock(mode);

test("B169 starts as idle study 25:00 without running on its own", () => {
  const clock = make();
  assert.deepEqual(clock, {
    mode: "study",
    phase: "idle",
    remainingMs: 1_500_000,
    deadlineMs: null,
  });
  assert.equal(formatFocusRemaining(clock.remainingMs), "25:00");
  assert.equal(advanceFocusClock(clock, 9_999_999), clock);
});

test("B169 rest interval is 5 min, always user-started", () => {
  const rest = make("rest");
  assert.equal(FOCUS_DURATIONS_MS.rest, 300_000);
  assert.equal(rest.phase, "idle");
  assert.equal(formatFocusRemaining(rest.remainingMs), "05:00");
  assert.equal(startFocusClock(rest, 100).deadlineMs, 300_100);
});

test("B169 deadline recovers background throttling with no interval drift", () => {
  const started = startFocusClock(make(), 1_000);
  const tick = advanceFocusClock(started, 31_000);
  assert.equal(tick.remainingMs, 1_470_000);
  assert.equal(formatFocusRemaining(tick.remainingMs), "24:30");
  const done = advanceFocusClock(tick, 1_501_000);
  assert.equal(done.phase, "done");
  assert.equal(formatFocusRemaining(done.remainingMs), "00:00");
});

test("B169 pausing freezes time and resuming preserves remaining duration", () => {
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

test("B169 repeated starts and pauses do not reset or extend time", () => {
  const start = startFocusClock(make(), 200);
  const again = startFocusClock(start, 210);
  assert.equal(again.deadlineMs, start.deadlineMs);
  assert.equal(again.remainingMs, start.remainingMs - 10);
  const paused = pauseFocusClock(again, 220);
  assert.equal(pauseFocusClock(paused, 900), paused);
});

test("B169 completed intervals cannot auto-restart; reset requires user action", () => {
  const start = startFocusClock(make("rest"), 500);
  const done = advanceFocusClock(start, 300_500);
  assert.equal(done.phase, "done");
  assert.equal(done.deadlineMs, null);
  assert.equal(startFocusClock(done, 400_000), done);
  assert.equal(pauseFocusClock(done, 400_000), done);
  assert.deepEqual(resetFocusClock(done), make("rest"));
  assert.deepEqual(selectFocusMode("study"), make());
});

test("B169 moving clock backwards never raises the displayed remaining time", () => {
  const start = startFocusClock(make(), 1_000);
  const progressed = advanceFocusClock(start, 61_000);
  const rolledBack = advanceFocusClock(progressed, 20_000);
  assert.equal(rolledBack.remainingMs, progressed.remainingMs);
  assert.equal(rolledBack.deadlineMs, progressed.deadlineMs);
});

test("B169 formatting rounds up without early completion", () => {
  assert.equal(formatFocusRemaining(1), "00:01");
  assert.equal(formatFocusRemaining(1000), "00:01");
  assert.equal(formatFocusRemaining(1001), "00:02");
  assert.equal(formatFocusRemaining(59_999), "01:00");
  assert.equal(formatFocusRemaining(0), "00:00");
});

test("B169 rejects unknown modes, malformed timestamps and negative durations", () => {
  for (const mode of ["all", "study ", "", null]) {
    assert.throws(() => make(mode), TypeError);
  }
  for (const now of [-1, NaN, Infinity, "1000", null]) {
    assert.throws(() => startFocusClock(make(), now), TypeError);
    assert.throws(() => advanceFocusClock(make(), now), TypeError);
  }
  for (const remainingMs of [-1, NaN, Infinity]) {
    assert.throws(() => formatFocusRemaining(remainingMs), TypeError);
  }
});

test("B169 scope-guard: remount per subject and auth session, never store or transmit", async () => {
  const workbench = await readFile("apps/web/src/pages/StudyWorkbench.tsx", "utf8");
  const page = await readFile("apps/web/src/pages/StudyFocusClock.tsx", "utf8");
  assert.ok(workbench.includes("<StudyFocusClock key="));
  assert.ok(workbench.includes("authScope}"));
  assert.ok(workbench.includes("selectedSubject.id"));
  assert.match(page, /aria-pressed=/u);
  assert.match(page, /aria-live="off"/u);
  assert.match(page, /role="status"/u);
  assert.match(page, /visibilitychange/u);
  assert.match(page, /window\.addEventListener\("focus"/u);
  assert.doesNotMatch(page,
    /fetch\(|axios|localStorage|sessionStorage|IndexedDB|Notification|Audio|AudioContext|navigator\.sendBeacon/u);
});
