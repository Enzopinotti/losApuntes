import assert from "node:assert/strict";
import test from "node:test";

import type {
  AcceptedResponse,
  EmailActionRequestInput,
  RegisterInput,
} from "@losapuntes/contracts";

import {
  EmailOnboardingController,
  type EmailOnboardingApi,
} from "../src/features/auth/email-onboarding-controller";
import { ApiRequestError } from "../src/services/api/client";

const ACCEPTED: AcceptedResponse = { accepted: true };

const makeApi = (overrides: Partial<EmailOnboardingApi> = {}) => {
  const requests: Array<
    | { action: "register"; input: RegisterInput; signal?: AbortSignal }
    | {
        action: "request_verification";
        input: EmailActionRequestInput;
        signal?: AbortSignal;
      }
  > = [];
  const api: EmailOnboardingApi = {
    register: async (input, signal) => {
      requests.push({
        action: "register",
        input,
        ...(signal ? { signal } : {}),
      });
      return ACCEPTED;
    },
    requestEmailVerification: async (input, signal) => {
      requests.push({
        action: "request_verification",
        input,
        ...(signal ? { signal } : {}),
      });
      return ACCEPTED;
    },
    ...overrides,
  };
  return { api, requests };
};

const deferred = <T>() => {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((complete) => {
    resolve = complete;
  });
  return { promise, resolve };
};

test("registration normalizes email and never stores the password in state", async () => {
  const { api, requests } = makeApi();
  const controller = new EmailOnboardingController(api);

  await controller.register("  Student@Example.edu ", "secret-password");

  assert.equal(requests[0]?.action, "register");
  assert.deepEqual(requests[0]?.input, {
    email: "student@example.edu",
    password: "secret-password",
  });
  assert.ok(requests[0]?.signal);
  assert.equal(controller.getSnapshot().kind, "accepted");
  assert.deepEqual(controller.getSnapshot(), {
    kind: "accepted",
    action: "register",
    email: "student@example.edu",
  });
  assert.equal(
    JSON.stringify(controller.getSnapshot()).includes("secret-password"),
    false,
  );
});

test("verification requests use the same normalized email and a generic accepted state", async () => {
  const { api, requests } = makeApi();
  const controller = new EmailOnboardingController(api);

  await controller.requestVerification(" Student@Example.edu ");

  assert.equal(requests[0]?.action, "request_verification");
  assert.deepEqual(requests[0]?.input, { email: "student@example.edu" });
  assert.deepEqual(controller.getSnapshot(), {
    kind: "accepted",
    action: "request_verification",
    email: "student@example.edu",
  });
});

test("reset aborts a pending request and fences its late completion", async () => {
  const pending = deferred<AcceptedResponse>();
  let signal: AbortSignal | undefined;
  const { api, requests } = makeApi({
    register: async (_input, requestSignal) => {
      signal = requestSignal;
      requests.push({
        action: "register",
        input: { email: "student@example.edu", password: "secret" },
        ...(requestSignal ? { signal: requestSignal } : {}),
      });
      return pending.promise;
    },
  });
  const controller = new EmailOnboardingController(api);

  const request = controller.register("student@example.edu", "secret");
  assert.ok(requests.length > 0);
  assert.ok(signal);
  controller.reset();
  pending.resolve(ACCEPTED);
  await request;

  assert.equal(signal.aborted, true);
  assert.deepEqual(controller.getSnapshot(), { kind: "idle" });
});

test("network errors produce typed retryable state without exposing server text", async () => {
  const { api } = makeApi({
    register: async () => {
      throw new ApiRequestError(
        "offline",
        null,
        "NETWORK_UNAVAILABLE",
        "private detail",
      );
    },
  });
  const controller = new EmailOnboardingController(api);

  await controller.register("student@example.edu", "secret");

  assert.deepEqual(controller.getSnapshot(), {
    kind: "failed",
    action: "register",
    email: "student@example.edu",
    failure: "offline",
  });
  assert.equal(
    JSON.stringify(controller.getSnapshot()).includes("private detail"),
    false,
  );
});
