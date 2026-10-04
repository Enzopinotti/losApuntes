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

test("Search and result destinations use the existing authenticated routes", async () => {
  const previousFetch = globalThis.fetch;
  const requests: Array<{ url: string; init?: RequestInit }> = [];
  globalThis.fetch = async (input, init) => {
    const url = String(input);
    requests.push({ url, ...(init ? { init } : {}) });
    return new Response(
      JSON.stringify(
        new URL(url).pathname === "/resources"
          ? { items: [], nextCursor: null }
          : {},
      ),
      {
        status: 200,
        headers: { "Content-Type": "application/json" },
      },
    );
  };

  try {
    const client = new MobileApiClient("https://api.example.test");
    await client.search("opaque-session", {
      q: "base de datos",
      scope: "resources",
      limit: 8,
      subjectId: "subject-a",
    });
    const subjectBrowse = await client.search("opaque-session", {
      scope: "resources",
      limit: 8,
      subjectId: "subject-a",
    });
    await client.contextualDiscovery("opaque-session", {
      subjectLimit: 6,
      resourcesPerSubject: 4,
    });
    await client.resource("opaque-session", "resource-a");
    await client.publicProfile("opaque-session", "profile-a");

    const searchUrl = new URL(requests[0]!.url);
    assert.equal(searchUrl.pathname, "/search");
    assert.equal(searchUrl.searchParams.get("q"), "base de datos");
    assert.equal(searchUrl.searchParams.get("scope"), "resources");
    assert.equal(searchUrl.searchParams.get("limit"), "8");
    assert.equal(searchUrl.searchParams.get("subjectId"), "subject-a");
    const resourceBrowseUrl = new URL(requests[1]!.url);
    assert.equal(resourceBrowseUrl.pathname, "/resources");
    assert.equal(resourceBrowseUrl.searchParams.get("q"), null);
    assert.equal(resourceBrowseUrl.searchParams.get("subjectId"), "subject-a");
    assert.equal(resourceBrowseUrl.searchParams.get("limit"), "8");
    assert.deepEqual(subjectBrowse, {
      query: "",
      scope: "resources",
      results: { resources: [], subjects: [], people: [] },
    });
    assert.equal(new URL(requests[2]!.url).pathname, "/discovery/contextual");
    assert.equal(
      new URL(requests[2]!.url).searchParams.get("subjectLimit"),
      "6",
    );
    assert.equal(
      new URL(requests[2]!.url).searchParams.get("resourcesPerSubject"),
      "4",
    );
    assert.equal(
      requests[3]!.url,
      "https://api.example.test/resources/resource-a",
    );
    assert.equal(
      requests[4]!.url,
      "https://api.example.test/profiles/profile-a",
    );
    assert.ok(
      requests.every(
        ({ init }) =>
          (init?.headers as Record<string, string>).Authorization ===
          "Bearer opaque-session",
      ),
    );
  } finally {
    globalThis.fetch = previousFetch;
  }
});

test("academic subjects encodes the optional affiliation scope", async () => {
  const originalFetch = globalThis.fetch;
  let requestedUrl = "";
  let requestInit: RequestInit | undefined;

  globalThis.fetch = (async (input, init) => {
    requestedUrl = String(input);
    requestInit = init;
    return new Response(
      JSON.stringify({ participations: [], truncated: false, limit: 100 }),
      {
        status: 200,
        headers: { "Content-Type": "application/json" },
      },
    );
  }) as typeof fetch;

  try {
    const client = new MobileApiClient("https://api.example.test");
    await client.academicSubjects("opaque-session", "aff/a");

    assert.equal(
      requestedUrl,
      "https://api.example.test/academic/me/subjects?affiliationId=aff%2Fa",
    );
    assert.equal(requestInit?.method, "GET");
    assert.equal(
      (requestInit?.headers as Record<string, string>).Authorization,
      "Bearer opaque-session",
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("successful empty responses do not become false offline failures", async () => {
  const previousFetch = globalThis.fetch;
  let requestInit: RequestInit | undefined;

  globalThis.fetch = async (_input, init) => {
    requestInit = init;
    return new Response(null, { status: 200 });
  };

  try {
    const client = new MobileApiClient("https://api.example.test");
    await assert.doesNotReject(() => client.logout("opaque-session"));
    assert.equal(requestInit?.method, "DELETE");
    assert.equal(
      (requestInit?.headers as Record<string, string>).Authorization,
      "Bearer opaque-session",
    );
  } finally {
    globalThis.fetch = previousFetch;
  }
});
