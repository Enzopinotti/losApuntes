import assert from "node:assert/strict";
import test from "node:test";

import type {
  AuthenticatedSessionResponse,
  ContextualDiscoveryResponse,
  MobileAuthenticatedSessionResponse,
  PasswordLoginInput,
  SearchResponse,
} from "@losapuntes/contracts";

import {
  MobileSearchApi,
  type MobileSearchTransport,
} from "../src/features/search/search-api";
import {
  SessionController,
  type SessionApi,
} from "../src/features/session/session-controller";
import type { SessionCredentialStore } from "../src/platform/session-credential-store";
import { ApiRequestError } from "../src/services/api/client";

const user = {
  id: "user-1",
  email: "student@example.edu",
  emailVerified: true,
};

const sessionRecord = (id: string) => ({
  id,
  clientType: "mobile" as const,
  createdAt: "2026-09-24T00:00:00.000Z",
  lastSeenAt: "2026-09-24T00:00:00.000Z",
  expiresAt: "2026-10-24T00:00:00.000Z",
  current: true,
});

class MemoryStore implements SessionCredentialStore {
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

const makeSessionApi = (tokenRef: { value: string }): SessionApi => ({
  mobileLogin: async (
    _input: PasswordLoginInput,
  ): Promise<MobileAuthenticatedSessionResponse> => ({
    user,
    session: sessionRecord(`session-${tokenRef.value[0]}`),
    sessionToken: tokenRef.value,
  }),
  me: async (): Promise<AuthenticatedSessionResponse> => ({
    user,
    session: sessionRecord("restored"),
  }),
  logout: async () => undefined,
});

const emptySearch = (
  query: string,
  scope: SearchResponse["scope"],
): SearchResponse => ({
  query,
  scope,
  results: { resources: [], subjects: [], people: [] },
});

const makeTransport = (
  overrides: Partial<MobileSearchTransport> = {},
): MobileSearchTransport => ({
  search: async (_credential, input) => emptySearch(input.q ?? "", input.scope),
  contextualDiscovery: async (): Promise<ContextualDiscoveryResponse> => ({
    subjects: [],
  }),
  resource: async () => {
    throw new Error("unused resource read");
  },
  publicProfile: async () => {
    throw new Error("unused profile read");
  },
  ...overrides,
});

test("allows a subject resource browse without a text predicate", async () => {
  const tokenRef = { value: "a".repeat(43) };
  const session = new SessionController(
    makeSessionApi(tokenRef),
    new MemoryStore(),
  );
  await session.login({ email: "student@example.edu", password: "password" });
  let receivedSearch: unknown;
  const api = new MobileSearchApi(
    session,
    makeTransport({
      search: async (credential, input) => {
        assert.equal(credential, tokenRef.value);
        receivedSearch = input;
        return emptySearch(input.q ?? "", input.scope);
      },
    }),
  );

  await api.search({ scope: "resources", subjectId: "subject-a" });

  assert.deepEqual(receivedSearch, {
    scope: "resources",
    subjectId: "subject-a",
    limit: 8,
  });
});

const deferred = <T>() => {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
};

test("uses the bounded server limits and preserves the subject filter", async () => {
  const tokenRef = { value: "a".repeat(43) };
  const session = new SessionController(
    makeSessionApi(tokenRef),
    new MemoryStore(),
  );
  await session.login({ email: "student@example.edu", password: "password" });
  let receivedSearch: unknown;
  let receivedContextual: unknown;
  let receivedCredential: string | undefined;
  const api = new MobileSearchApi(
    session,
    makeTransport({
      search: async (credential, input) => {
        receivedCredential = credential;
        receivedSearch = input;
        return emptySearch(input.q ?? "", input.scope);
      },
      contextualDiscovery: async (_credential, input) => {
        receivedContextual = input;
        return { subjects: [] };
      },
    }),
  );

  await api.search({
    q: "base de datos",
    scope: "resources",
    subjectId: "subject-a",
  });
  await api.contextualDiscovery();

  assert.equal(receivedCredential, tokenRef.value);
  assert.deepEqual(receivedSearch, {
    q: "base de datos",
    scope: "resources",
    subjectId: "subject-a",
    limit: 8,
  });
  assert.deepEqual(receivedContextual, {
    subjectLimit: 6,
    resourcesPerSubject: 4,
  });
});

test("does not return a successful search after the session generation changes", async () => {
  const tokenRef = { value: "a".repeat(43) };
  const store = new MemoryStore();
  const session = new SessionController(makeSessionApi(tokenRef), store);
  await session.login({ email: "student@example.edu", password: "password" });
  const pendingResponse = deferred<SearchResponse>();
  const api = new MobileSearchApi(
    session,
    makeTransport({ search: async () => pendingResponse.promise }),
  );

  const request = api.search({ q: "apuntes", scope: "all" });
  tokenRef.value = "b".repeat(43);
  await session.login({ email: "student@example.edu", password: "password" });
  pendingResponse.resolve(emptySearch("apuntes", "all"));

  await assert.rejects(
    () => request,
    (error: unknown) =>
      error instanceof ApiRequestError &&
      error.code === "STALE_SESSION_AUTHORITY",
  );
  assert.equal(session.getCredentialSnapshot()?.credential, tokenRef.value);
  assert.equal(store.value, tokenRef.value);
});
