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

test("Academic onboarding uses public canonical search and authenticated affiliation creation", async () => {
  const previousFetch = globalThis.fetch;
  const requests: Array<{ url: string; init?: RequestInit }> = [];
  const affiliation = {
    id: "aff-created",
    institutionId: "institution-1",
    status: "active",
    roles: ["student"],
    createdAt: "2026-10-01T00:00:00.000Z",
    updatedAt: "2026-10-01T00:00:00.000Z",
  };
  globalThis.fetch = async (input, init) => {
    requests.push({ url: String(input), ...(init ? { init } : {}) });
    return new Response(
      JSON.stringify(
        new URL(String(input)).pathname === "/academic/catalog/search"
          ? { items: [], nextCursor: null }
          : new URL(String(input)).pathname.startsWith("/academic/me/subjects/")
            ? {
                participation: {
                  id: "part-created",
                  subjectId: "subject-1",
                  subjectName: "Álgebra",
                  state: "current",
                  createdAt: "2026-10-01T00:00:00.000Z",
                  updatedAt: "2026-10-01T00:00:00.000Z",
                },
              }
            : { affiliation },
      ),
      {
        status: 200,
        headers: { "Content-Type": "application/json" },
      },
    );
  };

  try {
    const client = new MobileApiClient("https://api.example.test");
    await client.academicCatalogSearch({
      kind: "program",
      q: "Medicina",
      limit: 25,
      parentId: "institution-1",
      cursor: "opaque-cursor",
    });
    await client.createAcademicAffiliation("opaque-session", {
      institutionId: "institution-1",
      programId: "program-1",
      status: "active",
    });
    await client.upsertAcademicSubjectParticipation(
      "opaque-session",
      "subject-1",
      { state: "current" },
    );

    const search = requests[0]!;
    const searchUrl = new URL(search.url);
    assert.equal(searchUrl.pathname, "/academic/catalog/search");
    assert.equal(searchUrl.searchParams.get("kind"), "program");
    assert.equal(searchUrl.searchParams.get("q"), "Medicina");
    assert.equal(searchUrl.searchParams.get("limit"), "25");
    assert.equal(searchUrl.searchParams.get("cursor"), "opaque-cursor");
    assert.equal(searchUrl.searchParams.get("parentId"), "institution-1");
    assert.equal(search.init?.method, "GET");
    assert.equal(
      (search.init?.headers as Record<string, string> | undefined)
        ?.Authorization,
      undefined,
    );

    const create = requests[1]!;
    assert.equal(new URL(create.url).pathname, "/academic/me/affiliations");
    assert.equal(create.init?.method, "POST");
    assert.equal(
      (create.init?.headers as Record<string, string>).Authorization,
      "Bearer opaque-session",
    );
    assert.deepEqual(JSON.parse(String(create.init?.body)), {
      institutionId: "institution-1",
      programId: "program-1",
      status: "active",
    });
    const upsert = requests[2]!;
    assert.equal(
      new URL(upsert.url).pathname,
      "/academic/me/subjects/subject-1",
    );
    assert.equal(upsert.init?.method, "PUT");
    assert.equal(
      (upsert.init?.headers as Record<string, string>).Authorization,
      "Bearer opaque-session",
    );
    assert.deepEqual(JSON.parse(String(upsert.init?.body)), {
      state: "current",
    });
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
    await client.publicProfileActivities(
      "opaque-session",
      "profile/a",
      "cursor+/next",
      20,
    );

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
    const publicActivitiesUrl = new URL(requests[5]!.url);
    assert.equal(
      publicActivitiesUrl.pathname,
      "/profiles/profile%2Fa/activities",
    );
    assert.equal(
      publicActivitiesUrl.searchParams.get("cursor"),
      "cursor+/next",
    );
    assert.equal(publicActivitiesUrl.searchParams.get("limit"), "20");
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

test("Home cursor transports preserve mode, page size, opaque cursor and bearer", async () => {
  const previousFetch = globalThis.fetch;
  const requests: Array<{ url: URL; init: RequestInit | undefined }> = [];
  globalThis.fetch = async (input, init) => {
    requests.push({ url: new URL(String(input)), init });
    return new Response(
      JSON.stringify({ items: [], nextCursor: null, stopReason: "end" }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    );
  };

  try {
    const api = new MobileApiClient("https://api.example.test");
    const cursor = "opaque/+?=cursor==";
    await api.academicFeed("owner-session", cursor);
    await api.forYouFeed("owner-session", cursor, "balanced");
    await api.forYouFeed("owner-session", cursor, "community");

    assert.equal(requests.length, 3);
    const [academic, forYou, community] = requests;
    assert.equal(academic?.url.pathname, "/feeds/academic");
    assert.equal(forYou?.url.pathname, "/feeds/for-you");
    assert.equal(community?.url.pathname, "/feeds/for-you");
    assert.deepEqual(
      requests.map(({ url }) => url.searchParams.get("limit")),
      ["6", "6", "6"],
    );
    assert.deepEqual(
      requests.map(({ url }) => url.searchParams.get("cursor")),
      [cursor, cursor, cursor],
    );
    assert.deepEqual(
      requests.map(({ url }) => url.searchParams.get("mode")),
      [null, "balanced", "community"],
    );
    assert.deepEqual(
      requests.map(({ url }) => url.searchParams.get("order")),
      [null, "ranked", "ranked"],
    );
    assert.ok(
      requests.every(
        ({ init }) =>
          init?.method === "GET" &&
          (init?.headers as Record<string, string>).Authorization ===
            "Bearer owner-session",
      ),
    );
  } finally {
    globalThis.fetch = previousFetch;
  }
});
