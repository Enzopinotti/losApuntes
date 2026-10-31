import assert from "node:assert/strict";
import test from "node:test";

import { MobileApiClient } from "../src/services/api/client";

test("public profile paging encodes IDs and cursors with owner session", async () => {
  const originalFetch = globalThis.fetch;
  let url = "";
  let init: RequestInit | undefined;
  globalThis.fetch = async (input, options) => {
    url = String(input);
    init = options;
    return new Response(JSON.stringify({ items: [], nextCursor: null }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  };
  try {
    const client = new MobileApiClient("https://api.example.test");
    assert.deepEqual(
      await client.publicProfileActivities(
        "session-token",
        "profile/a",
        "next/+?==",
        20,
      ),
      { items: [], nextCursor: null },
    );
    const requested = new URL(url);
    assert.equal(requested.pathname, "/profiles/profile%2Fa/activities");
    assert.equal(requested.searchParams.get("cursor"), "next/+?==");
    assert.equal(requested.searchParams.get("limit"), "20");
    assert.equal(init?.method, "GET");
    assert.equal(
      (init?.headers as Record<string, string>).Authorization,
      "Bearer session-token",
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});
