import assert from "node:assert/strict";
import test from "node:test";

import type { PilotHomeResponse } from "@losapuntes/contracts";

import { MobileApiClient } from "../src/services/api/client";

test("pilot Home uses the authenticated server-owned endpoint", async () => {
  const previousFetch = globalThis.fetch;
  let requestedUrl = "";
  let requestInit: RequestInit | undefined;
  const expected = {
    profileReady: true,
    lifecycle: {
      phase: "community",
      activeStudentAffiliationIds: [],
      alumniAffiliationIds: [],
      currentSubjectIds: [],
      hasCurrentSubjectContext: false,
      currentAffiliationId: null,
      follows: [],
      followsTruncated: false,
      followsLimit: 20,
    },
    academic: { currentContext: null, currentSubjectIds: [] },
    homeFeed: {
      kind: "community",
      items: [],
      nextCursor: null,
      stopReason: "end",
    },
    academicFeed: {
      items: [],
      nextCursor: null,
      stopReason: "end",
      context: { subjectIds: [] },
    },
    forYou: {
      items: [],
      nextCursor: null,
      stopReason: "end",
      effectiveSignals: {
        academic: false,
        social: true,
        interests: true,
        relationWindowTruncated: false,
      },
    },
    notifications: { unreadCount: 0 },
  } satisfies PilotHomeResponse;

  globalThis.fetch = async (input, init) => {
    requestedUrl = String(input);
    requestInit = init;
    return new Response(JSON.stringify(expected), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  };

  try {
    const client = new MobileApiClient("https://api.example.test");
    assert.deepEqual(await client.pilotHome("opaque-session"), expected);
    assert.equal(requestedUrl, "https://api.example.test/pilot/home");
    assert.equal(requestInit?.method, "GET");
    assert.equal(
      (requestInit?.headers as Record<string, string>).Authorization,
      "Bearer opaque-session",
    );
  } finally {
    globalThis.fetch = previousFetch;
  }
});
