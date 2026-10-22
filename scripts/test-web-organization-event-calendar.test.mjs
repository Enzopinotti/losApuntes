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

test("includes only safe HTTPS event URLs as the standard URL property", () => {
  const calendar = serializeOrganizationEventCalendar(
    makeEvent({
      externalUrl: "https://example.test/event?mode=public&lang=es",
    }),
    fixedNow,
  );
  assert.match(
    calendar,
    /URL:https:\/\/example\.test\/event\?mode=public&lang=es\r\n/u,
  );

  for (const externalUrl of [
    "javascript:alert(1)",
    "https://user:password@example.test/event",
    "https://example.test/event\r\nATTENDEE:attacker@example.test",
    `https://example.test/${"a".repeat(2048)}`,
  ]) {
    const rejected = serializeOrganizationEventCalendar(
      makeEvent({ externalUrl }),
      fixedNow,
    );
    assert.doesNotMatch(rejected, /^URL:/mu);
    assert.doesNotMatch(rejected, /DESCRIPTION:[^\r\n]*javascript:/u);
    assert.doesNotMatch(rejected, /ATTENDEE:attacker/u);
  }
});

test("escapes calendar control characters and folds long UTF-8 lines safely", () => {
  const calendar = serializeOrganizationEventCalendar(
    makeEvent({
      title: `Clase, práctica;\n\u0000 ${"á🙂".repeat(50)}`,
      locationLabel: "Pabellón\\Norte",
      externalUrl: `https://example.test/${"a".repeat(90)}`,
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
