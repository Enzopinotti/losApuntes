import assert from "node:assert/strict";
import test from "node:test";

import { withTtlMonitorPaused } from "./auth-ttl-guard.mjs";

test("pauses before the scenario and restores on success", async () => {
  const steps = [];
  const value = await withTtlMonitorPaused(
    {
      readEnabled: () => true,
      setEnabled: (enabled) => steps.push(enabled ? "restore" : "pause"),
    },
    () => {
      steps.push("scenario");
      return "done";
    },
  );
  assert.equal(value, "done");
  assert.deepEqual(steps, ["pause", "scenario", "restore"]);
});

test("restores after a failed scenario", async () => {
  const steps = [];
  await assert.rejects(
    withTtlMonitorPaused(
      {
        readEnabled: () => true,
        setEnabled: (enabled) => steps.push(enabled ? "restore" : "pause"),
      },
      () => {
        steps.push("scenario");
        throw new Error("scenario failed");
      },
    ),
    /scenario failed/u,
  );
  assert.deepEqual(steps, ["pause", "scenario", "restore"]);
});

test("preserves a monitor that was already disabled", async () => {
  const steps = [];
  await withTtlMonitorPaused(
    {
      readEnabled: () => false,
      setEnabled: () => steps.push("unexpected mutation"),
    },
    () => steps.push("scenario"),
  );
  assert.deepEqual(steps, ["scenario"]);
});

test("attempts restoration even if disabling fails", async () => {
  const steps = [];
  await assert.rejects(
    withTtlMonitorPaused(
      {
        readEnabled: () => true,
        setEnabled: (enabled) => {
          steps.push(enabled ? "restore" : "pause");
          if (!enabled) throw new Error("cannot pause TTL");
        },
      },
      () => steps.push("should not execute"),
    ),
    /cannot pause TTL/u,
  );
  assert.deepEqual(steps, ["pause", "restore"]);
});

test("refuses invalid monitor state without executing the scenario", async () => {
  let called = false;
  await assert.rejects(
    withTtlMonitorPaused(
      { readEnabled: () => "enabled", setEnabled: () => (called = true) },
      () => (called = true),
    ),
    /must be a boolean/u,
  );
  assert.equal(called, false);
});

test("a restoration failure cannot be reported as a successful smoke", async () => {
  await assert.rejects(
    withTtlMonitorPaused(
      {
        readEnabled: () => true,
        setEnabled: (enabled) => {
          if (enabled) throw new Error("TTL restoration failed");
        },
      },
      () => "scenario passed",
    ),
    /TTL restoration failed/u,
  );
});
