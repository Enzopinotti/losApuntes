import assert from "node:assert/strict";
import test from "node:test";

import { MobileApiClient } from "../src/services/api/client";

test("email onboarding uses existing unauthenticated Auth endpoints", async () => {
  const previousFetch = globalThis.fetch;
  const requests: Array<{ url: string; init?: RequestInit }> = [];
  globalThis.fetch = async (input, init) => {
    requests.push({ url: String(input), ...(init ? { init } : {}) });
    const pathname = new URL(String(input)).pathname;
    if (pathname.endsWith("/inspect")) {
      return new Response(
        JSON.stringify({ verification: { available: true } }),
        {
          status: 200,
          headers: { "Content-Type": "application/json" },
        },
      );
    }
    if (pathname.endsWith("/complete")) {
      return new Response(null, { status: 204 });
    }
    return new Response(JSON.stringify({ accepted: true }), {
      status: 202,
      headers: { "Content-Type": "application/json" },
    });
  };

  try {
    const client = new MobileApiClient("https://api.example.test");
    await client.register({
      email: "student@example.edu",
      password: "password",
    });
    await client.requestEmailVerification({ email: "student@example.edu" });
    await client.inspectEmailVerification({ token: "v".repeat(43) });
    await client.completeEmailVerification({ token: "v".repeat(43) });

    assert.deepEqual(
      requests.map(({ url }) => new URL(url).pathname),
      [
        "/auth/register",
        "/auth/email-verification/request",
        "/auth/email-verification/inspect",
        "/auth/email-verification/complete",
      ],
    );
    assert.deepEqual(
      requests.map(({ init }) => init?.method),
      ["POST", "POST", "POST", "POST"],
    );
    assert.ok(
      requests.every(
        ({ init }) =>
          (init?.headers as Record<string, string>).Authorization === undefined,
      ),
    );
    assert.deepEqual(JSON.parse(String(requests[0]?.init?.body)), {
      email: "student@example.edu",
      password: "password",
    });
    assert.deepEqual(JSON.parse(String(requests[1]?.init?.body)), {
      email: "student@example.edu",
    });
    assert.deepEqual(JSON.parse(String(requests[2]?.init?.body)), {
      token: "v".repeat(43),
    });
    assert.deepEqual(JSON.parse(String(requests[3]?.init?.body)), {
      token: "v".repeat(43),
    });
  } finally {
    globalThis.fetch = previousFetch;
  }
});
