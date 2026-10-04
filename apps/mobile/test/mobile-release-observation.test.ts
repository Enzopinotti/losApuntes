import assert from "node:assert/strict";
import test from "node:test";

import {
  observeMobileServerRelease,
  type MobileReleaseFetch,
} from "../src/config/release-observation";
import { qualifyMobileRelease } from "../src/config/release-qualification";

const API_SOURCE_SHA = "abcdef1234567890abcdef1234567890abcdef12";

function availablePayload(overrides: Record<string, unknown> = {}) {
  return {
    status: "available",
    service: "api",
    releaseId: "api-2026.10.03-1",
    sourceSha: API_SOURCE_SHA,
    ...overrides,
  };
}

test("observes bounded release identity from the configured API origin", async () => {
  let requestedUrl = "";
  let requestedInit: RequestInit | undefined;
  const fetcher: MobileReleaseFetch = async (input, init) => {
    requestedUrl = input;
    requestedInit = init;
    return new Response(
      JSON.stringify(
        availablePayload({ sourceSha: API_SOURCE_SHA.toUpperCase() }),
      ),
      { status: 200 },
    );
  };

  const observation = await observeMobileServerRelease(
    "https://api.example.test/",
    fetcher,
  );

  assert.equal(requestedUrl, "https://api.example.test/health/release");
  assert.equal(requestedInit?.method, "GET");
  assert.equal(requestedInit?.credentials, "omit");
  assert.equal(requestedInit?.cache, "no-store");
  assert.equal(requestedInit?.redirect, "error");
  assert.ok(requestedInit?.signal instanceof AbortSignal);
  assert.equal(
    new Headers(requestedInit?.headers).get("accept"),
    "application/json",
  );
  assert.deepEqual(observation, {
    source: "api-observation",
    apiOrigin: "https://api.example.test",
    releaseId: "api-2026.10.03-1",
    sourceSha: API_SOURCE_SHA,
  });

  const qualification = qualifyMobileRelease(
    {
      apiOrigin: "https://api.example.test",
      sourceSha: API_SOURCE_SHA,
      appVersion: "0.1.0",
      build: "42",
      distributionProfile: "production",
    },
    observation,
  );
  assert.equal(qualification.status, "qualified");
  assert.equal(qualification.serverRelease?.sourceSha, API_SOURCE_SHA);
});

test("rejects unavailable, malformed or private-looking API release payloads", async () => {
  const invalidPayloads = [
    { status: "unavailable", service: "api" },
    availablePayload({ service: "web" }),
    availablePayload({ releaseId: "api release for user@example.test" }),
    availablePayload({ sourceSha: "main" }),
    availablePayload({ sourceSha: null }),
    [],
    null,
  ];

  for (const payload of invalidPayloads) {
    const fetcher: MobileReleaseFetch = async () =>
      new Response(JSON.stringify(payload), { status: 200 });
    assert.equal(
      await observeMobileServerRelease("https://api.example.test", fetcher),
      null,
    );
  }

  const malformedJson: MobileReleaseFetch = async () =>
    new Response("not json", { status: 200 });
  assert.equal(
    await observeMobileServerRelease("https://api.example.test", malformedJson),
    null,
  );
});

test("returns no observation for invalid origin, HTTP failure or network failure", async () => {
  let fetchCount = 0;
  const countedFailure: MobileReleaseFetch = async () => {
    fetchCount += 1;
    return new Response("unavailable", { status: 503 });
  };

  assert.equal(
    await observeMobileServerRelease(
      "https://api.example.test/v1",
      countedFailure,
    ),
    null,
  );
  assert.equal(fetchCount, 0);
  assert.equal(
    await observeMobileServerRelease(
      "https://api.example.test",
      countedFailure,
    ),
    null,
  );
  assert.equal(fetchCount, 1);

  const networkFailure: MobileReleaseFetch = async () => {
    fetchCount += 1;
    throw new Error("private network detail");
  };
  assert.equal(
    await observeMobileServerRelease(
      "https://api.example.test",
      networkFailure,
    ),
    null,
  );
  assert.equal(fetchCount, 2);
});
