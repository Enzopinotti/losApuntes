import assert from "node:assert/strict";
import test from "node:test";
import { serializeOrganizationEventCalendar } from "../apps/web/src/features/organizations/organization-event-calendar.mjs";

const fixedNow = new Date("2026-10-22T16:30:00.000Z");

const makeEvent = (overrides = {}) => ({
  id: "evt-42",
  title: "Taller de estudio",
  description: "Una actividad útil",
  startsAt: "2026-11-03T18:00:00.000-03:00",
  endsAt: "2026-11-03T19:30:00.000-03:00",
  locationLabel: "Aula 12",
  externalUrl: "https://example.test/event",
  state: "scheduled",
  revision: 1,
  createdAt: "2026-10-01T12:00:00.000Z",
  updatedAt: "2026-10-01T12:00:00.000Z",
  ...overrides,
});

test("serializes a scheduled event with UTC dates and optional event details", () => {
  const calendar = serializeOrganizationEventCalendar(makeEvent(), fixedNow);

  assert.match(calendar, /^BEGIN:VCALENDAR\r\n/u);
  assert.match(calendar, /VERSION:2\.0\r\n/u);
  assert.match(calendar, /UID:evt-42@events\.losapuntes\.app\r\n/u);
  assert.match(calendar, /DTSTAMP:20261022T163000Z\r\n/u);
  assert.match(calendar, /DTSTART:20261103T210000Z\r\n/u);
  assert.match(calendar, /DTEND:20261103T223000Z\r\n/u);
  assert.match(calendar, /SUMMARY:Taller de estudio\r\n/u);
  assert.match(calendar, /URL:https:\/\/example\.test\/event\r\n/u);
  assert.match(
    calendar,
    /DESCRIPTION:Una actividad útil\\n\\nhttps:\/\/example\.test\/event\r\n/u,
  );
  assert.match(calendar, /LOCATION:Aula 12\r\n/u);
  assert.match(calendar, /END:VEVENT\r\nEND:VCALENDAR\r\n$/u);
});

test("keeps only validated HTTPS event links in URL and description", () => {
  const calendar = serializeOrganizationEventCalendar(
    makeEvent({ externalUrl: "https://example.test/event?mode=public&lang=es" }),
    fixedNow,
  );
  assert.match(
    calendar,
    /URL:https:\/\/example\.test\/event\?mode=public&lang=es\r\n/u,
  );

  const maliciousLinks = [
    "javascript:alert(1)",
    "http://example.test/event",
    "https://user:secret@example.test/event",
    "https://example.test/event\r\nATTENDEE:attacker@example.test",
    "https://example.test/path with spaces",
    "https://example.test/" + "a".repeat(2048),
    "not a url",
    "\u0000https://example.test",
  ];
  for (const externalUrl of maliciousLinks) {
    const result = serializeOrganizationEventCalendar(
      makeEvent({ externalUrl }),
      fixedNow,
    );
    assert.doesNotMatch(result, /^URL:/mu);
    assert.doesNotMatch(result, /attacker@example\.test|javascript:|secret@/u);
    assert.match(result, /DESCRIPTION:Una actividad útil\r\n/u);
  }
});

test("folds long valid event URL lines to 75 UTF-8 octets", () => {
  const result = serializeOrganizationEventCalendar(
    makeEvent({ externalUrl: "https://example.test/" + "a".repeat(120) }),
    fixedNow,
  );
  assert.match(result, /^URL:https:\/\/example\.test\//mu);
  const encoder = new TextEncoder();
  for (const line of result.split("\r\n")) {
    assert.ok(encoder.encode(line).length <= 75);
  }
});

test("escapes calendar control characters and folds long UTF-8 lines safely", () => {
  const calendar = serializeOrganizationEventCalendar(
    makeEvent({
      title: `Clase, práctica;\n\u0000 ${"á🙂".repeat(50)}`,
      locationLabel: "Pabellón\\Norte",
    }),
    fixedNow,
  );
  const summary = calendar
    .split("\r\n")
    .filter((line) => line.startsWith("SUMMARY:") || line.startsWith(" "));
  const bytes = new TextEncoder();

  assert.match(calendar, /SUMMARY:Clase\\, práctica\\;\\n/u);
  assert.match(calendar, /LOCATION:Pabellón\\\\Norte\r\n/u);
  assert.doesNotMatch(
    calendar,
    /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/u,
  );
  assert.ok(summary.length > 1);
  for (const line of calendar.split("\r\n")) {
    assert.ok(
      bytes.encode(line).length <= 75,
      `line exceeded 75 octets: ${line}`,
    );
  }
});

test("does not export cancelled, malformed, or unbounded event identities", () => {
  assert.equal(
    serializeOrganizationEventCalendar(
      makeEvent({ state: "cancelled" }),
      fixedNow,
    ),
    null,
  );
  assert.equal(
    serializeOrganizationEventCalendar(
      makeEvent({ startsAt: "invalid" }),
      fixedNow,
    ),
    null,
  );
  assert.equal(
    serializeOrganizationEventCalendar(
      makeEvent({ endsAt: "2026-11-03T17:00:00.000-03:00" }),
      fixedNow,
    ),
    null,
  );
  assert.equal(
    serializeOrganizationEventCalendar(
      makeEvent({ id: "x".repeat(257) }),
      fixedNow,
    ),
    null,
  );
});

test("supports events without a duration, description, or location", () => {
  const calendar = serializeOrganizationEventCalendar(
    makeEvent({
      endsAt: null,
      description: null,
      locationLabel: null,
      externalUrl: null,
    }),
    fixedNow,
  );

  assert.match(calendar, /DTSTART:20261103T210000Z\r\n/u);
  assert.doesNotMatch(calendar, /DTEND:|DESCRIPTION:|LOCATION:/u);
});

test("rejects an explicit end that is not later than the source start", () => {
  for (const [startsAt, endsAt] of [
    ["2026-11-03T18:00:00-03:00", "2026-11-03T21:00:00Z"],
    ["2026-11-03T21:00:00.900Z", "2026-11-03T21:00:00.100Z"],
  ]) {
    assert.equal(
      serializeOrganizationEventCalendar(
        makeEvent({ startsAt, endsAt }),
        fixedNow,
      ),
      null,
    );
  }
});

test("rounds a positive fractional-second end up while preserving a valid event", () => {
  const calendar = serializeOrganizationEventCalendar(
    makeEvent({
      startsAt: "2026-11-03T21:00:00.100Z",
      endsAt: "2026-11-03T21:00:00.900Z",
    }),
    fixedNow,
  );
  assert.match(calendar, /DTSTART:20261103T210000Z\r\n/u);
  assert.match(calendar, /DTEND:20261103T210001Z\r\n/u);
});
