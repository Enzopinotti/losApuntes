import assert from "node:assert/strict";
import test from "node:test";

import {
  mobileOrganizationEventShareMessage,
  safeOrganizationEventExternalUrl,
} from "../src/features/organizations/organization-event-share";

test("organization event links accept only bounded credential-free HTTPS URLs", () => {
  assert.equal(
    safeOrganizationEventExternalUrl("https://example.org/events/42"),
    "https://example.org/events/42",
  );
  for (const value of [
    "http://example.org/events/42",
    "javascript:alert(1)",
    "https://user:pass@example.org/events/42",
    "https://example.org/unsafe\nBCC:leak",
    " https://example.org/events/42",
    "https://example.org/events/42 ",
    "https://example.org/".padEnd(2049, "a"),
    "not-a-url",
    "",
    null,
    undefined,
  ]) {
    assert.equal(safeOrganizationEventExternalUrl(value), null, String(value));
  }
});

test("Mobile shares scheduled event links with sanitized titles", () => {
  assert.equal(
    mobileOrganizationEventShareMessage({
      title: "  Jornada\nacadémica  ",
      externalUrl: "https://example.org/event?id=7",
      state: "scheduled",
    }),
    "Evento: Jornada académica\nhttps://example.org/event?id=7",
  );
});

test("Mobile never offers a share link for cancelled or unsafe events", () => {
  assert.equal(
    mobileOrganizationEventShareMessage({
      title: "Charla",
      externalUrl: "https://example.org/event",
      state: "cancelled",
    }),
    null,
  );
  assert.equal(
    mobileOrganizationEventShareMessage({
      title: "Charla",
      externalUrl: "http://example.org/event",
      state: "scheduled",
    }),
    null,
  );
  assert.equal(
    mobileOrganizationEventShareMessage({
      title: "   ",
      externalUrl: "https://example.org/event",
      state: "scheduled",
    }),
    "https://example.org/event",
  );
});
