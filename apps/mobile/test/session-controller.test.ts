import assert from "node:assert/strict";
import test from "node:test";

import type {
  AuthenticatedSessionResponse,
  MobileAuthenticatedSessionResponse,
  PasswordLoginInput,
} from "@losapuntes/contracts";

import type { SessionCredentialStore } from "../src/platform/session-credential-store";
import {
  SessionController,
  type SessionApi,
} from "../src/features/session/session-controller";
import { ApiRequestError } from "../src/services/api/client";

const USER = {
  id: "user-1",
  email: "student@example.edu",
  emailVerified: true,
};

const SESSION = {
  id: "session-1",
  clientType: "mobile" as const,
  createdAt: "2026-09-24T00:00:00.000Z",
  lastSeenAt: "2026-09-24T00:00:00.000Z",
  expiresAt: "2026-10-24T00:00:00.000Z",
  current: true,
};

const authResult = (
  token = "s".repeat(43),
): MobileAuthenticatedSessionResponse => ({
  user: USER,
  session: SESSION,
  sessionToken: token,
});

const deferred = <T>() => {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
};

class MemoryCredentialStore implements SessionCredentialStore {
  value: string | null;
  reads = 0;
  writes: string[] = [];
  clears = 0;
  failWrite = false;

  constructor(value: string | null = null) {
    this.value = value;
  }

  async read() {
    this.reads += 1;
    return this.value;
  }

  async write(credential: string) {
    this.writes.push(credential);
    if (this.failWrite) throw new Error("secure storage unavailable");
    this.value = credential;
  }

  async clear() {
    this.clears += 1;
    this.value = null;
  }
}

const api = (overrides: Partial<SessionApi> = {}): SessionApi => ({
  mobileLogin: async (_input: PasswordLoginInput) => authResult(),
  me: async (_credential: string): Promise<AuthenticatedSessionResponse> => ({
    user: USER,
    session: SESSION,
  }),
  logout: async (_credential: string) => undefined,
  ...overrides,
});

test("restores only after the server revalidates the secure credential", async () => {
  const store = new MemoryCredentialStore("r".repeat(43));
  const controller = new SessionController(api(), store);

  await controller.restore();

  assert.equal(controller.getSnapshot().kind, "authenticated");
  assert.equal(controller.getCredentialSnapshot()?.credential, "r".repeat(43));
  assert.equal(store.clears, 0);
});

test("revoked restore clears the local credential and becomes unauthenticated", async () => {
  const store = new MemoryCredentialStore("r".repeat(43));
  const controller = new SessionController(
    api({
      me: async () => {
        throw new ApiRequestError(
          "unauthorized",
          401,
          "AUTHENTICATION_REQUIRED",
          "Authentication required",
        );
      },
    }),
    store,
  );

  await controller.restore();

  assert.equal(controller.getSnapshot().kind, "unauthenticated");
  assert.equal(store.value, null);
  assert.equal(store.clears, 1);
});

test("offline restore preserves the secure credential without granting authority", async () => {
  const credential = "r".repeat(43);
  const store = new MemoryCredentialStore(credential);
  const controller = new SessionController(
    api({
      me: async () => {
        throw new ApiRequestError(
          "offline",
          null,
          "NETWORK_UNAVAILABLE",
          "offline",
        );
      },
    }),
    store,
  );

  await controller.restore();

  assert.equal(controller.getSnapshot().kind, "offline");
  assert.equal(controller.getCredentialSnapshot(), null);
  assert.equal(store.value, credential);
});

test("logout fences a delayed restore so it cannot resurrect the old session", async () => {
  const pending = deferred<AuthenticatedSessionResponse>();
  const store = new MemoryCredentialStore("r".repeat(43));
  const controller = new SessionController(
    api({ me: async () => pending.promise }),
    store,
  );

  const restore = controller.restore();
  await Promise.resolve();
  await controller.logout();

  pending.resolve({ user: USER, session: SESSION });
  await restore;

  assert.equal(controller.getSnapshot().kind, "unauthenticated");
  assert.equal(controller.getCredentialSnapshot(), null);
  assert.equal(store.value, null);
});

test("candidate persistence failure revokes the server candidate best effort", async () => {
  const candidate = "c".repeat(43);
  const store = new MemoryCredentialStore();
  store.failWrite = true;
  const revoked: string[] = [];
  const controller = new SessionController(
    api({
      mobileLogin: async () => authResult(candidate),
      logout: async (credential) => {
        revoked.push(credential);
      },
    }),
    store,
  );

  await controller.login({
    email: "student@example.edu",
    password: "correct horse battery staple",
  });

  assert.equal(controller.getSnapshot().kind, "error");
  assert.deepEqual(revoked, [candidate]);
  assert.equal(controller.getCredentialSnapshot(), null);
});

test("logical logout happens before a delayed server revoke completes", async () => {
  const revoke = deferred<void>();
  const store = new MemoryCredentialStore();
  const controller = new SessionController(
    api({
      mobileLogin: async () => authResult(),
      logout: async () => revoke.promise,
    }),
    store,
  );

  await controller.login({
    email: "student@example.edu",
    password: "correct horse battery staple",
  });

  const logout = controller.logout();
  assert.equal(controller.getSnapshot().kind, "unauthenticated");
  assert.equal(controller.getCredentialSnapshot(), null);

  revoke.resolve();
  await logout;
  assert.equal(store.value, null);
});

test("an obsolete credential generation cannot clear a newer login", async () => {
  const first = "a".repeat(43);
  const second = "b".repeat(43);
  const store = new MemoryCredentialStore();
  let next = first;
  const controller = new SessionController(
    api({
      mobileLogin: async () => authResult(next),
    }),
    store,
  );

  await controller.login({ email: "a@example.edu", password: "one" });
  const stale = controller.getCredentialSnapshot();
  assert.ok(stale);

  next = second;
  await controller.login({ email: "b@example.edu", password: "two" });
  await controller.invalidateIfAuthoritative(
    stale.credential,
    stale.generation,
  );

  assert.equal(controller.getSnapshot().kind, "authenticated");
  assert.equal(controller.getCredentialSnapshot()?.credential, second);
  assert.equal(store.value, second);
});
