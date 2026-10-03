import assert from "node:assert/strict";
import test from "node:test";

import type {
  AcceptedResponse,
  ActionTokenInput,
  EmailActionRequestInput,
  PasswordRecoveryCompleteInput,
} from "@losapuntes/contracts";

import { createAuthActionTokenVault } from "../src/features/auth/action-token-vault";
import {
  newPasswordValidationMessage,
  PasswordRecoveryController,
  requestPasswordRecovery,
  type PasswordRecoveryApi,
} from "../src/features/auth/password-recovery";
import { ApiRequestError } from "../src/services/api/client";

const ACCEPTED: AcceptedResponse = { accepted: true };
const TOKEN = "R".repeat(43);

const makeApi = (overrides: Partial<PasswordRecoveryApi> = {}) => {
  const requests: Array<
    | { action: "request"; input: EmailActionRequestInput }
    | { action: "inspect"; input: ActionTokenInput }
    | { action: "complete"; input: PasswordRecoveryCompleteInput }
  > = [];

  const api: PasswordRecoveryApi = {
    requestPasswordRecovery: async (input) => {
      requests.push({ action: "request", input });
      return ACCEPTED;
    },
    inspectPasswordRecovery: async (input) => {
      requests.push({ action: "inspect", input });
      return { recovery: { available: true } };
    },
    completePasswordRecovery: async (input) => {
      requests.push({ action: "complete", input });
    },
    ...overrides,
  };

  return { api, requests };
};

const recoveryHandle = () => {
  const vault = createAuthActionTokenVault();
  const handle = vault.capture("password_recovery", TOKEN);
  assert.ok(handle);
  return { vault, handle };
};

test("recovery request normalizes email and exposes only generic acceptance", async () => {
  const { api, requests } = makeApi();

  assert.equal(
    await requestPasswordRecovery(api, "  Student@Example.edu  "),
    "accepted",
  );
  assert.deepEqual(requests, [
    {
      action: "request",
      input: { email: "student@example.edu" },
    },
  ]);
});

test("controller consumes the opaque handle, inspects first, then completes", async () => {
  const { api, requests } = makeApi();
  const { vault, handle } = recoveryHandle();
  const controller = new PasswordRecoveryController(api, vault);

  await controller.inspect(handle);
  assert.deepEqual(controller.getSnapshot(), { kind: "ready" });
  assert.equal(JSON.stringify(controller.getSnapshot()).includes(TOKEN), false);

  await controller.complete("a-valid-password-for-mobile");
  assert.deepEqual(controller.getSnapshot(), { kind: "success" });
  assert.deepEqual(requests, [
    { action: "inspect", input: { token: TOKEN } },
    {
      action: "complete",
      input: {
        token: TOKEN,
        newPassword: "a-valid-password-for-mobile",
      },
    },
  ]);

  await controller.retryInspect();
  assert.deepEqual(controller.getSnapshot(), {
    kind: "failed",
    failure: "invalid_link",
  });
});

test("retryable inspection failure keeps the token only in controller memory", async () => {
  let inspectCalls = 0;
  const { api } = makeApi({
    inspectPasswordRecovery: async () => {
      inspectCalls += 1;
      if (inspectCalls === 1) {
        throw new ApiRequestError(
          "offline",
          null,
          "NETWORK_UNAVAILABLE",
          "private network detail",
        );
      }
      return { recovery: { available: true } };
    },
  });
  const { vault, handle } = recoveryHandle();
  const controller = new PasswordRecoveryController(api, vault);

  await controller.inspect(handle);
  assert.deepEqual(controller.getSnapshot(), {
    kind: "failed",
    failure: "offline",
  });
  assert.equal(JSON.stringify(controller.getSnapshot()).includes(TOKEN), false);
  assert.equal(
    JSON.stringify(controller.getSnapshot()).includes("private network detail"),
    false,
  );

  await controller.retryInspect();
  assert.deepEqual(controller.getSnapshot(), { kind: "ready" });
  assert.equal(inspectCalls, 2);
});

test("RECOVERY_NOT_AVAILABLE destroys the retry path", async () => {
  let inspectCalls = 0;
  const { api } = makeApi({
    inspectPasswordRecovery: async () => {
      inspectCalls += 1;
      throw new ApiRequestError(
        "gone",
        410,
        "RECOVERY_NOT_AVAILABLE",
        "private expiry detail",
      );
    },
  });
  const { vault, handle } = recoveryHandle();
  const controller = new PasswordRecoveryController(api, vault);

  await controller.inspect(handle);
  assert.deepEqual(controller.getSnapshot(), {
    kind: "failed",
    failure: "invalid_link",
  });

  await controller.retryInspect();
  assert.equal(inspectCalls, 1);
  assert.deepEqual(controller.getSnapshot(), {
    kind: "failed",
    failure: "invalid_link",
  });
});

test("completion transport failure returns to ready and can be retried", async () => {
  let completeCalls = 0;
  const { api } = makeApi({
    completePasswordRecovery: async () => {
      completeCalls += 1;
      if (completeCalls === 1) {
        throw new ApiRequestError(
          "timeout",
          null,
          "REQUEST_TIMEOUT",
          "private timeout detail",
        );
      }
    },
  });
  const { vault, handle } = recoveryHandle();
  const controller = new PasswordRecoveryController(api, vault);

  await controller.inspect(handle);
  await controller.complete("a-valid-password-for-mobile");
  assert.deepEqual(controller.getSnapshot(), {
    kind: "ready",
    failure: "timeout",
  });

  await controller.complete("a-valid-password-for-mobile");
  assert.deepEqual(controller.getSnapshot(), { kind: "success" });
  assert.equal(completeCalls, 2);
});

test("dispose aborts pending inspection and fences its late completion", async () => {
  let requestSignal: AbortSignal | undefined;
  let resolveInspection!: () => void;
  const pendingInspection = new Promise<void>((resolve) => {
    resolveInspection = resolve;
  });
  const { api } = makeApi({
    inspectPasswordRecovery: async (_input, signal) => {
      requestSignal = signal;
      await pendingInspection;
      return { recovery: { available: true } };
    },
  });
  const { vault, handle } = recoveryHandle();
  const controller = new PasswordRecoveryController(api, vault);

  const inspection = controller.inspect(handle);
  await Promise.resolve();
  assert.ok(requestSignal);

  controller.dispose();
  resolveInspection();
  await inspection;

  assert.equal(requestSignal.aborted, true);
  assert.equal(controller.getSnapshot().kind, "checking");
});

test("mobile recovery applies the same 15-to-256 Unicode password bounds", () => {
  assert.equal(
    newPasswordValidationMessage("a".repeat(14)),
    "Usá al menos 15 caracteres.",
  );
  assert.equal(newPasswordValidationMessage("a".repeat(15)), true);
  assert.equal(newPasswordValidationMessage("😀".repeat(15)), true);
  assert.equal(
    newPasswordValidationMessage("a".repeat(257)),
    "Usá como máximo 256 caracteres.",
  );
});
