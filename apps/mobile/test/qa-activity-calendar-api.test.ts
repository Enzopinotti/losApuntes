import assert from "node:assert/strict";
import test from "node:test";

import {
  ApiRequestError,
  type MobileApiClient,
} from "../src/services/api/client";
import type { SessionController } from "../src/features/session/session-controller";
import {
  MobileQaActivityCalendarApi,
  parseQaActivityCalendar,
  QaActivityCalendarHttpTransport,
  type QaActivityCalendarTransport,
} from "../src/features/community/qa-activity-calendar-api";
import {
  qaActivityCalendarCells,
  qaActivityCalendarSummary,
} from "../src/features/community/qa-activity-calendar-presentation";

const DAY_MS = 24 * 60 * 60 * 1000;

function fixture() {
  const start = Date.parse("2026-09-25T00:00:00.000Z");
  const days = Array.from({ length: 28 }, (_, index) => {
    const dateUtc = new Date(start + index * DAY_MS).toISOString().slice(0, 10);
    const questions = index === 27 ? 1 : 0;
    const answers = index === 26 ? 2 : 0;
    return { dateUtc, questions, answers, total: questions + answers };
  });
  return {
    asOfUtc: "2026-10-22T20:00:00.000Z",
    windowStartUtc: "2026-09-25T00:00:00.000Z",
    windowEndUtcExclusive: "2026-10-23T00:00:00.000Z",
    days,
  };
}

function sessionStub(overrides: Record<string, unknown> = {}) {
  return {
    getCredentialSnapshot: () => ({
      credential: "current-token",
      generation: 7,
    }),
    isCredentialAuthoritative: () => true,
    invalidateIfAuthoritative: async () => undefined,
    restrictIfAuthoritative: async () => undefined,
    ...overrides,
  } as unknown as SessionController;
}

test("transport reads only the private owner activity calendar endpoint", async () => {
  const calls: Array<{ path: string; options: Record<string, unknown> }> = [];
  const client = {
    request: async (path: string, options: Record<string, unknown>) => {
      calls.push({ path, options });
      return fixture();
    },
  } as unknown as MobileApiClient;
  const signal = new AbortController().signal;
  const transport = new QaActivityCalendarHttpTransport(client);
  await transport.get("current-token", signal);
  assert.deepEqual(calls, [
    {
      path: "/qa/me/activity-calendar",
      options: { credential: "current-token", signal },
    },
  ]);
});

test("missing credentials reject before sending the private request", async () => {
  let calls = 0;
  const transport: QaActivityCalendarTransport = {
    get: async () => {
      calls += 1;
      return fixture();
    },
  };
  const api = new MobileQaActivityCalendarApi(
    sessionStub({ getCredentialSnapshot: () => null }),
    transport,
  );
  await assert.rejects(api.get(), (error: unknown) => {
    assert.ok(error instanceof ApiRequestError);
    assert.equal(error.code, "AUTHENTICATION_REQUIRED");
    return true;
  });
  assert.equal(calls, 0);
});

test("late responses reject after the session generation changes", async () => {
  const transport: QaActivityCalendarTransport = { get: async () => fixture() };
  const api = new MobileQaActivityCalendarApi(
    sessionStub({ isCredentialAuthoritative: () => false }),
    transport,
  );
  await assert.rejects(api.get(), (error: unknown) => {
    assert.ok(error instanceof ApiRequestError);
    assert.equal(error.code, "STALE_SESSION_AUTHORITY");
    return true;
  });
});

test("validates the complete consecutive 28-day UTC window and daily totals", () => {
  const calendar = parseQaActivityCalendar(fixture());
  const summary = qaActivityCalendarSummary(calendar);
  assert.equal(calendar.days.length, 28);
  assert.deepEqual(summary, { questions: 1, answers: 2, activeDays: 2 });
  const cells = qaActivityCalendarCells(calendar);
  assert.equal(cells.length, 32);
  assert.equal(cells[0]?.kind, "spacer");
  assert.equal(cells[4]?.kind, "day");
});

test("rejects missing dates, incorrect totals and non-UTC window bounds", () => {
  const missingDay = fixture();
  missingDay.days.pop();
  assert.throws(
    () => parseQaActivityCalendar(missingDay),
    (error: unknown) =>
      error instanceof ApiRequestError &&
      error.code === "QA_ACTIVITY_CALENDAR_UNAVAILABLE",
  );

  const wrongTotal = fixture();
  wrongTotal.days[0]!.total = 1;
  assert.throws(
    () => parseQaActivityCalendar(wrongTotal),
    (error: unknown) =>
      error instanceof ApiRequestError &&
      error.code === "QA_ACTIVITY_CALENDAR_UNAVAILABLE",
  );

  const shiftedWindow = fixture();
  shiftedWindow.windowStartUtc = "2026-09-25T03:00:00.000Z";
  assert.throws(
    () => parseQaActivityCalendar(shiftedWindow),
    (error: unknown) =>
      error instanceof ApiRequestError &&
      error.code === "QA_ACTIVITY_CALENDAR_UNAVAILABLE",
  );
});
