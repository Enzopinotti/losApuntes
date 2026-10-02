import assert from "node:assert/strict";
import test from "node:test";

import type {
  AuthSessionListResponse,
  AuthenticatedSessionResponse,
  MobileAuthenticatedSessionResponse,
  PasswordLoginInput,
  PilotHomeResponse,
} from "@losapuntes/contracts";

import {
  AuthenticatedMobileApi,
  type AuthenticatedApiTransport,
} from "../src/features/session/authenticated-api";
import {
  SessionController,
  type SessionApi,
} from "../src/features/session/session-controller";
import type { SessionCredentialStore } from "../src/platform/session-credential-store";
import { ApiRequestError } from "../src/services/api/client";

const sessionRecord = (id: string) => ({
  id,
  clientType: "mobile" as const,
  createdAt: "2026-09-24T00:00:00.000Z",
  lastSeenAt: "2026-09-24T00:00:00.000Z",
  expiresAt: "2026-10-24T00:00:00.000Z",
  current: true,
});

const user = {
  id: "user-1",
  email: "student@example.edu",
  emailVerified: true,
};

class Store implements SessionCredentialStore {
  value: string | null = null;

  async read() {
    return this.value;
  }

  async write(value: string) {
    this.value = value;
  }

  async clear() {
    this.value = null;
  }
}

const sessionApi = (tokenRef: { value: string }): SessionApi => ({
  mobileLogin: async (
    _input: PasswordLoginInput,
  ): Promise<MobileAuthenticatedSessionResponse> => ({
    user,
    session: sessionRecord(`session-${tokenRef.value[0]}`),
    sessionToken: tokenRef.value,
  }),
  me: async (): Promise<AuthenticatedSessionResponse> => ({
    user,
    session: sessionRecord("session-restored"),
  }),
  logout: async () => undefined,
});

const transport = (
  overrides: Partial<AuthenticatedApiTransport> = {},
): AuthenticatedApiTransport => ({
  pilotHome: async (): Promise<PilotHomeResponse> => ({
    profileReady: true,
    lifecycle: {
      phase: "student",
      activeStudentAffiliationIds: ["aff-1"],
      alumniAffiliationIds: [],
      currentSubjectIds: ["subject-1"],
      hasCurrentSubjectContext: true,
      currentAffiliationId: "aff-1",
      follows: [],
      followsTruncated: false,
      followsLimit: 20,
    },
    academic: {
      currentContext: {
        affiliationId: "aff-1",
        updatedAt: "2026-10-01T00:00:00.000Z",
      },
      currentSubjectIds: ["subject-1"],
    },
    homeFeed: {
      kind: "subjects",
      items: [],
      nextCursor: null,
      stopReason: "end",
    },
    academicFeed: {
      items: [],
      nextCursor: null,
      stopReason: "end",
      context: { subjectIds: ["subject-1"] },
    },
    forYou: {
      items: [],
      nextCursor: null,
      stopReason: "end",
      effectiveSignals: {
        academic: true,
        social: true,
        interests: false,
        relationWindowTruncated: false,
      },
    },
    notifications: { unreadCount: 0 },
  }),
  listSessions: async () => ({ sessions: [], truncated: false, limit: 20 }),
  revokeSession: async () => undefined,
  revokeAllSessions: async () => undefined,
  changePassword: async () => undefined,
  googleMobileLink: async () => undefined,
  loginMethods: async () => ({
    passwordConfigured: true,
    googleConnected: false,
  }),
  unlinkGoogle: async () => undefined,
  ...overrides,
});

test("home is read through the credential-fenced authenticated API", async () => {
  const token = { value: "a".repeat(43) };
  const session = new SessionController(sessionApi(token), new Store());
  await session.login({ email: "a@example.edu", password: "password" });
  let receivedCredential: string | null = null;
  const expected: PilotHomeResponse = {
    profileReady: true,
    lifecycle: {
      phase: "student",
      activeStudentAffiliationIds: ["aff-1"],
      alumniAffiliationIds: [],
      currentSubjectIds: [],
      hasCurrentSubjectContext: false,
      currentAffiliationId: "aff-1",
      follows: [],
      followsTruncated: false,
      followsLimit: 20,
    },
    academic: {
      currentContext: {
        affiliationId: "aff-1",
        updatedAt: "2026-10-01T00:00:00.000Z",
      },
      currentSubjectIds: [],
    },
    homeFeed: {
      kind: "subjects",
      items: [],
      nextCursor: "next",
      stopReason: null,
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
        academic: true,
        social: false,
        interests: true,
        relationWindowTruncated: false,
      },
    },
    notifications: { unreadCount: 2 },
  };
  const api = new AuthenticatedMobileApi(
    session,
    transport({
      pilotHome: async (credential) => {
        receivedCredential = credential;
        return expected;
      },
    }),
  );

  assert.deepEqual(await api.pilotHome(), expected);
  assert.equal(receivedCredential, token.value);
});

test("session inventory keeps truncation metadata from the shared contract", async () => {
  const token = { value: "a".repeat(43) };
  const store = new Store();
  const session = new SessionController(sessionApi(token), store);
  await session.login({ email: "a@example.edu", password: "password" });

  const expected: AuthSessionListResponse = {
    sessions: [sessionRecord("session-visible")],
    truncated: true,
    limit: 20,
  };
  const api = new AuthenticatedMobileApi(
    session,
    transport({
      listSessions: async () => expected,
    }),
  );

  await assert.deepEqual(await api.listSessions(), expected);
});

test("a 401 from an authoritative credential clears that session", async () => {
  const token = { value: "a".repeat(43) };
  const store = new Store();
  const session = new SessionController(sessionApi(token), store);
  await session.login({ email: "a@example.edu", password: "password" });

  const api = new AuthenticatedMobileApi(
    session,
    transport({
      listSessions: async () => {
        throw new ApiRequestError(
          "unauthorized",
          401,
          "AUTHENTICATION_REQUIRED",
          "Authentication required",
        );
      },
    }),
  );

  await assert.rejects(() => api.listSessions(), ApiRequestError);
  assert.equal(session.getSnapshot().kind, "unauthenticated");
  assert.equal(store.value, null);
});

test("a delayed 401 from an old generation cannot clear a newer login", async () => {
  const token = { value: "a".repeat(43) };
  const store = new Store();
  const session = new SessionController(sessionApi(token), store);
  await session.login({ email: "a@example.edu", password: "password" });

  let rejectOld!: (reason: unknown) => void;
  const oldCall = new Promise<AuthSessionListResponse>((_resolve, reject) => {
    rejectOld = reject;
  });
  const api = new AuthenticatedMobileApi(
    session,
    transport({ listSessions: async () => oldCall }),
  );

  const pending = api.listSessions();
  await Promise.resolve();

  token.value = "b".repeat(43);
  await session.login({ email: "b@example.edu", password: "password" });

  rejectOld(
    new ApiRequestError(
      "unauthorized",
      401,
      "AUTHENTICATION_REQUIRED",
      "Authentication required",
    ),
  );
  await assert.rejects(() => pending, ApiRequestError);

  assert.equal(session.getSnapshot().kind, "authenticated");
  assert.equal(session.getCredentialSnapshot()?.credential, token.value);
  assert.equal(store.value, token.value);
});

test("account restriction clears authority and preserves restricted state", async () => {
  const token = { value: "a".repeat(43) };
  const store = new Store();
  const session = new SessionController(sessionApi(token), store);
  await session.login({ email: "a@example.edu", password: "password" });

  const api = new AuthenticatedMobileApi(
    session,
    transport({
      loginMethods: async () => {
        throw new ApiRequestError(
          "forbidden",
          403,
          "ACCOUNT_RESTRICTED",
          "restricted",
        );
      },
    }),
  );

  await assert.rejects(() => api.loginMethods(), ApiRequestError);
  assert.equal(session.getSnapshot().kind, "restricted");
  assert.equal(store.value, null);
});

test("password change clears the local credential after server success", async () => {
  const token = { value: "a".repeat(43) };
  const store = new Store();
  const session = new SessionController(sessionApi(token), store);
  await session.login({ email: "a@example.edu", password: "old-password" });

  const api = new AuthenticatedMobileApi(session, transport());
  await api.changePassword({
    currentPassword: "old-password",
    newPassword: "a much longer new password",
  });

  assert.equal(session.getSnapshot().kind, "unauthenticated");
  assert.equal(store.value, null);
});

test("revoking the current session clears local authority", async () => {
  const token = { value: "a".repeat(43) };
  const store = new Store();
  const session = new SessionController(sessionApi(token), store);
  await session.login({ email: "a@example.edu", password: "password" });

  const current = session.getSnapshot();
  assert.equal(current.kind, "authenticated");
  if (current.kind !== "authenticated") throw new Error("missing session");

  const api = new AuthenticatedMobileApi(session, transport());
  await api.revokeSession(current.session.id);

  assert.equal(session.getSnapshot().kind, "unauthenticated");
  assert.equal(store.value, null);
});

test("a delayed success from an old generation is rejected", async () => {
  const token = { value: "a".repeat(43) };
  const store = new Store();
  const session = new SessionController(sessionApi(token), store);
  await session.login({ email: "a@example.edu", password: "password" });

  let resolveOld!: (value: AuthSessionListResponse) => void;
  const oldCall = new Promise<AuthSessionListResponse>((resolve) => {
    resolveOld = resolve;
  });
  const api = new AuthenticatedMobileApi(
    session,
    transport({ listSessions: async () => oldCall }),
  );

  const pending = api.listSessions();
  await Promise.resolve();

  token.value = "b".repeat(43);
  await session.login({ email: "b@example.edu", password: "password" });

  resolveOld({
    sessions: [sessionRecord("session-old")],
    truncated: false,
    limit: 20,
  });

  await assert.rejects(
    () => pending,
    (error: unknown) =>
      error instanceof ApiRequestError &&
      error.code === "STALE_SESSION_AUTHORITY",
  );
  assert.equal(session.getCredentialSnapshot()?.credential, token.value);
  assert.equal(store.value, token.value);
});
