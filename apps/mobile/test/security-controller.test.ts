import assert from "node:assert/strict";
import test from "node:test";

import type {
  AuthSession,
  AuthSessionListResponse,
  PasswordChangeInput,
} from "@losapuntes/contracts";

import {
  MobileSecurityController,
  type MobileSecurityApi,
} from "../src/features/auth/security-controller";
import { ApiRequestError } from "../src/services/api/client";

const session = (
  id: string,
  current = false,
  clientType: "web" | "mobile" = "mobile",
): AuthSession => ({
  id,
  clientType,
  createdAt: "2026-10-01T10:00:00.000Z",
  lastSeenAt: "2026-10-03T10:00:00.000Z",
  expiresAt: "2026-11-01T10:00:00.000Z",
  current,
});

const inventory = (
  sessions: AuthSession[],
  truncated = false,
): AuthSessionListResponse => ({
  sessions,
  truncated,
  limit: 20,
});

const deferred = <T>() => {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((nextResolve, nextReject) => {
    resolve = nextResolve;
    reject = nextReject;
  });
  return { promise, resolve, reject };
};

const makeApi = (overrides: Partial<MobileSecurityApi> = {}) => {
  const calls: string[] = [];
  const api: MobileSecurityApi = {
    listSessions: async () => {
      calls.push("list");
      return inventory([session("current", true)]);
    },
    revokeSession: async (sessionId) => {
      calls.push(`revoke:${sessionId}`);
    },
    revokeAllSessions: async () => {
      calls.push("revoke-all");
    },
    changePassword: async (_input: PasswordChangeInput) => {
      calls.push("password");
    },
    ...overrides,
  };
  return { api, calls };
};

test("loads only privacy-bounded session inventory contract state", async () => {
  const { api } = makeApi({
    listSessions: async () =>
      inventory(
        [session("current", true), session("web-other", false, "web")],
        true,
      ),
  });
  const controller = new MobileSecurityController(api);

  await controller.load();

  const snapshot = controller.getSnapshot();
  assert.equal(snapshot.kind, "ready");
  if (snapshot.kind !== "ready") throw new Error("missing ready state");

  assert.equal(snapshot.truncated, true);
  assert.equal(snapshot.limit, 20);
  assert.deepEqual(
    snapshot.sessions.map((item) => ({
      id: item.id,
      clientType: item.clientType,
      current: item.current,
    })),
    [
      { id: "current", clientType: "mobile", current: true },
      { id: "web-other", clientType: "web", current: false },
    ],
  );
});
test("revoking another session reloads inventory without signing out", async () => {
  let listCalls = 0;
  const { api, calls } = makeApi({
    listSessions: async () => {
      listCalls += 1;
      return listCalls === 1
        ? inventory([session("current", true), session("other")])
        : inventory([session("current", true)]);
    },
  });
  const controller = new MobileSecurityController(api);

  await controller.load();
  const ready = controller.getSnapshot();
  assert.equal(ready.kind, "ready");
  if (ready.kind !== "ready") throw new Error("missing ready state");

  const target = ready.sessions.find((item) => item.id === "other");
  assert.ok(target);
  await controller.revokeSession(target);

  assert.deepEqual(calls, ["revoke:other"]);
  const after = controller.getSnapshot();
  assert.equal(after.kind, "ready");
  if (after.kind !== "ready") throw new Error("missing refreshed state");
  assert.deepEqual(
    after.sessions.map((item) => item.id),
    ["current"],
  );
  assert.equal(after.feedback, "Sesión cerrada.");
});
test("revoking the current session ends the security surface", async () => {
  const { api } = makeApi();
  const controller = new MobileSecurityController(api);

  await controller.load();
  const ready = controller.getSnapshot();
  assert.equal(ready.kind, "ready");
  if (ready.kind !== "ready") throw new Error("missing ready state");

  await controller.revokeSession(ready.sessions[0]!);

  assert.deepEqual(controller.getSnapshot(), {
    kind: "signed_out",
    reason: "current_session_revoked",
  });
});

test("revoke-all fences a late revoke completion from restoring stale state", async () => {
  const lateRevoke = deferred<void>();
  const { api } = makeApi({
    listSessions: async () =>
      inventory([session("current", true), session("other")]),
    revokeSession: async () => lateRevoke.promise,
  });
  const controller = new MobileSecurityController(api);

  await controller.load();
  const ready = controller.getSnapshot();
  assert.equal(ready.kind, "ready");
  if (ready.kind !== "ready") throw new Error("missing ready state");

  const target = ready.sessions.find((item) => item.id === "other");
  assert.ok(target);

  const staleRevoke = controller.revokeSession(target);
  await Promise.resolve();

  await controller.revokeAllSessions();
  assert.deepEqual(controller.getSnapshot(), {
    kind: "signed_out",
    reason: "all_sessions_revoked",
  });

  lateRevoke.resolve();
  await staleRevoke;

  assert.deepEqual(controller.getSnapshot(), {
    kind: "signed_out",
    reason: "all_sessions_revoked",
  });
});

test("password success signs out while invalid current password stays retryable", async () => {
  let attempts = 0;
  const { api } = makeApi({
    changePassword: async () => {
      attempts += 1;
      if (attempts === 1) {
        throw new ApiRequestError(
          "validation",
          400,
          "INVALID_CURRENT_PASSWORD",
          "private server text",
        );
      }
    },
  });
  const controller = new MobileSecurityController(api);

  await controller.load();
  await controller.changePassword({
    currentPassword: "wrong",
    newPassword: "a sufficiently long password",
  });

  const retry = controller.getSnapshot();
  assert.equal(retry.kind, "ready");
  if (retry.kind !== "ready") throw new Error("missing retry state");
  assert.equal(retry.failure, "invalid_current_password");
  assert.equal(JSON.stringify(retry).includes("private server text"), false);

  await controller.changePassword({
    currentPassword: "correct",
    newPassword: "another sufficiently long password",
  });
  assert.deepEqual(controller.getSnapshot(), {
    kind: "signed_out",
    reason: "password_changed",
  });
});

test("dispose aborts pending inventory and fences late completion", async () => {
  const pending = deferred<AuthSessionListResponse>();
  let signal: AbortSignal | undefined;
  const { api } = makeApi({
    listSessions: async (requestSignal) => {
      signal = requestSignal;
      return pending.promise;
    },
  });
  const controller = new MobileSecurityController(api);

  const loading = controller.load();
  await Promise.resolve();
  assert.ok(signal);

  controller.dispose();
  pending.resolve(inventory([session("stale", true)]));
  await loading;

  assert.equal(signal.aborted, true);
  assert.deepEqual(controller.getSnapshot(), { kind: "loading" });
});
test("account restriction stays distinct from ordinary sign-out", async () => {
  const { api } = makeApi({
    listSessions: async () => {
      throw new ApiRequestError(
        "forbidden",
        403,
        "ACCOUNT_RESTRICTED",
        "private restriction detail",
      );
    },
  });
  const controller = new MobileSecurityController(api);

  await controller.load();

  assert.deepEqual(controller.getSnapshot(), {
    kind: "signed_out",
    reason: "account_restricted",
  });
});

test("lost authentication authority becomes a signed-out state", async () => {
  const { api } = makeApi({
    listSessions: async () => {
      throw new ApiRequestError(
        "unauthorized",
        401,
        "AUTHENTICATION_REQUIRED",
        "private auth detail",
      );
    },
  });
  const controller = new MobileSecurityController(api);

  await controller.load();

  assert.deepEqual(controller.getSnapshot(), {
    kind: "signed_out",
    reason: "authority_lost",
  });
});
