import assert from "node:assert/strict";
import test from "node:test";

import { ApiRequestError } from "../src/services/api/client";
import type { QaActivityCalendar } from "../src/features/community/qa-activity-calendar-api";
import {
  QaActivityCalendarController,
  type QaActivityCalendarApi,
} from "../src/features/community/qa-activity-calendar-controller";

const calendar: QaActivityCalendar = {
  asOfUtc: "2026-10-22T20:00:00.000Z",
  windowStartUtc: "2026-09-25T00:00:00.000Z",
  windowEndUtcExclusive: "2026-10-23T00:00:00.000Z",
  days: [],
};

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((res) => {
    resolve = res;
  });
  return { promise, resolve };
}

function setup(overrides: Partial<QaActivityCalendarApi> = {}) {
  const signals: AbortSignal[] = [];
  const api: QaActivityCalendarApi = {
    get: async (signal) => {
      if (signal) signals.push(signal);
      return calendar;
    },
    ...overrides,
  };
  return { controller: new QaActivityCalendarController(api), signals };
}

test("loads the owner activity calendar for the active profile authority", async () => {
  const { controller, signals } = setup();
  await controller.load("user:session");
  const snapshot = controller.getSnapshot();
  assert.equal(signals.length, 1);
  assert.equal(snapshot.kind, "ready");
  if (snapshot.kind === "ready") {
    assert.equal(snapshot.authorityKey, "user:session");
    assert.equal(snapshot.calendar.asOfUtc, calendar.asOfUtc);
  }
});

test("closing aborts and fences a pending calendar response", async () => {
  const pending = deferred<QaActivityCalendar>();
  let signal: AbortSignal | undefined;
  const { controller } = setup({
    get: async (requestSignal) => {
      signal = requestSignal;
      return pending.promise;
    },
  });
  const loading = controller.load("user:session");
  controller.close();
  pending.resolve(calendar);
  await loading;
  assert.equal(signal?.aborted, true);
  assert.deepEqual(controller.getSnapshot(), { kind: "idle" });
});

test("offline failure remains retryable", async () => {
  const { controller } = setup({
    get: async () => {
      throw new ApiRequestError("offline", null, "NETWORK_OFFLINE", "offline");
    },
  });
  await controller.load("user:session");
  const snapshot = controller.getSnapshot();
  assert.equal(snapshot.kind, "error");
  if (snapshot.kind === "error") {
    assert.equal(snapshot.retryable, true);
    assert.match(snapshot.message, /No hay conexión/u);
  }
});
