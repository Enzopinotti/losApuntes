import assert from "node:assert/strict";
import test from "node:test";

import {
  loginWithGoogle,
  requestGoogleIdToken,
  type GoogleIdentityProvider,
} from "../src/features/auth/google-mobile-flow";
import { ApiRequestError } from "../src/services/api/client";

const provider = (
  requestIdToken: GoogleIdentityProvider["requestIdToken"],
): GoogleIdentityProvider => ({ requestIdToken });

test("Google login sends the ID token to the app login exchange", async () => {
  const received: string[] = [];
  const outcome = await loginWithGoogle(
    provider(async () => ({ kind: "success", idToken: "google-token" })),
    async (idToken) => {
      received.push(idToken);
    },
  );

  assert.deepEqual(outcome, { kind: "authenticated" });
  assert.deepEqual(received, ["google-token"]);
});

test("Google cancellation remains silent", async () => {
  let loginCalls = 0;
  const outcome = await loginWithGoogle(
    provider(async () => ({ kind: "cancelled" })),
    async () => {
      loginCalls += 1;
    },
  );

  assert.deepEqual(outcome, { kind: "cancelled" });
  assert.equal(loginCalls, 0);
});

test("unavailable providers and blank ID tokens do not call app login", async () => {
  let loginCalls = 0;
  const unavailable = await loginWithGoogle(
    provider(async () => ({ kind: "unavailable" })),
    async () => {
      loginCalls += 1;
    },
  );
  const blank = await requestGoogleIdToken(
    provider(async () => ({ kind: "success", idToken: "  " })),
  );

  assert.deepEqual(unavailable, { kind: "unavailable" });
  assert.deepEqual(blank, { kind: "failed" });
  assert.equal(loginCalls, 0);
});

test("provider exceptions and backend errors become stable safe outcomes", async () => {
  const providerFailure = await loginWithGoogle(
    provider(async () => {
      throw new Error("private native provider text");
    }),
    async () => undefined,
  );
  const linkRequired = await loginWithGoogle(
    provider(async () => ({ kind: "success", idToken: "google-token" })),
    async () => {
      throw new ApiRequestError(
        "forbidden",
        403,
        "GOOGLE_LINK_REQUIRED",
        "private server detail",
      );
    },
  );
  const networkFailure = await loginWithGoogle(
    provider(async () => ({ kind: "success", idToken: "google-token" })),
    async () => {
      throw new ApiRequestError("offline", null, "NETWORK_ERROR", "offline");
    },
  );

  assert.deepEqual(providerFailure, { kind: "provider_failed" });
  assert.deepEqual(linkRequired, { kind: "link_required" });
  assert.deepEqual(networkFailure, { kind: "network_failed" });
  assert.equal(
    JSON.stringify([providerFailure, linkRequired, networkFailure]).includes(
      "private",
    ),
    false,
  );
});
