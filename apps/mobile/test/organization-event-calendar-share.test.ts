import assert from "node:assert/strict";
import test from "node:test";

import type { OrganizationEvent } from "@losapuntes/contracts";
import {
  shareOrganizationEventCalendar,
  type OrganizationCalendarSharePort,
} from "../src/features/organizations/organization-event-calendar-share";

const event: OrganizationEvent = {
  id: "event/42",
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
};

test("shares a valid calendar file and cleans the temporary copy", async () => {
  const calls: Array<{ filename: string; contents: string }> = [];
  const shared: string[] = [];
  let cleaned = false;
  const port: OrganizationCalendarSharePort = {
    createFile: (filename, contents) => {
      calls.push({ filename, contents });
      return {
        uri: "file:///cache/event.ics",
        cleanup: () => {
          cleaned = true;
        },
      };
    },
    shareFile: (uri) => {
      shared.push(uri);
    },
  };

  await shareOrganizationEventCalendar(
    event,
    port,
    new Date("2026-10-22T16:30:00.000Z"),
  );

  assert.equal(calls.length, 1);
  assert.equal(
    calls[0]?.filename,
    "organization-event-event-42-1792686600000.ics",
  );
  assert.match(calls[0]?.contents ?? "", /BEGIN:VCALENDAR\r\n/u);
  assert.match(calls[0]?.contents ?? "", /SUMMARY:Taller de estudio\r\n/u);
  assert.deepEqual(shared, ["file:///cache/event.ics"]);
  assert.equal(cleaned, true);
});

test("rejects cancelled or malformed events before creating a file", async () => {
  let created = false;
  const port: OrganizationCalendarSharePort = {
    createFile: () => {
      created = true;
      return { uri: "file:///cache/event.ics", cleanup: () => {} };
    },
    shareFile: () => {},
  };

  await assert.rejects(
    shareOrganizationEventCalendar({ ...event, state: "cancelled" }, port),
    /Event cannot be exported/u,
  );
  await assert.rejects(
    shareOrganizationEventCalendar({ ...event, startsAt: "invalid" }, port),
    /Event cannot be exported/u,
  );
  assert.equal(created, false);
});

test("cleans the temporary file when the operating-system share is dismissed with an error", async () => {
  let cleaned = false;
  const port: OrganizationCalendarSharePort = {
    createFile: () => ({
      uri: "file:///cache/event.ics",
      cleanup: () => {
        cleaned = true;
      },
    }),
    shareFile: async () => {
      throw new Error("Share sheet unavailable");
    },
  };

  await assert.rejects(
    shareOrganizationEventCalendar(event, port),
    /Share sheet unavailable/u,
  );
  assert.equal(cleaned, true);
});
