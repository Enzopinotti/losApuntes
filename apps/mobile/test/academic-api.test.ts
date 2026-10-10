import assert from "node:assert/strict";
import test from "node:test";

import type {
  AcademicCatalogSearchResponse,
  AcademicAffiliationListResponse,
  AcademicCurrentContextResponse,
  AcademicSubjectParticipationListResponse,
  AuthenticatedSessionResponse,
  MobileAuthenticatedSessionResponse,
  PasswordLoginInput,
} from "@losapuntes/contracts";

import {
  AcademicMobileApi,
  type AcademicContextTransport,
} from "../src/features/academic/academic-api";
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
  overrides: Partial<AcademicContextTransport> = {},
): AcademicContextTransport => ({
  academicCatalogSearch: async (): Promise<AcademicCatalogSearchResponse> => ({
    items: [],
    nextCursor: null,
  }),
  academicAffiliations: async (): Promise<AcademicAffiliationListResponse> => ({
    affiliations: [],
    truncated: false,
    limit: 50,
  }),
  academicSubjects:
    async (): Promise<AcademicSubjectParticipationListResponse> => ({
      participations: [],
      truncated: false,
      limit: 100,
    }),
  createAcademicAffiliation: async (_credential, input) => ({
    affiliation: {
      id: "aff-created",
      institutionId: input.institutionId,
      status: input.status,
      roles: input.roles ?? ["student"],
      createdAt: "2026-10-01T00:00:00.000Z",
      updatedAt: "2026-10-01T00:00:00.000Z",
    },
  }),
  academicContext: async (): Promise<AcademicCurrentContextResponse> => ({
    context: null,
  }),
  setAcademicContext: async (): Promise<AcademicCurrentContextResponse> => ({
    context: null,
  }),
  ...overrides,
});

test("a successful Academic response is fenced by credential generation", async () => {
  const token = { value: "a".repeat(43) };
  const store = new Store();
  const session = new SessionController(sessionApi(token), store);
  await session.login({ email: "a@example.edu", password: "password" });

  let resolveOld!: (value: AcademicCurrentContextResponse) => void;
  const oldCall = new Promise<AcademicCurrentContextResponse>((resolve) => {
    resolveOld = resolve;
  });
  const api = new AcademicMobileApi(
    session,
    transport({ academicContext: async () => oldCall }),
  );

  const pending = api.context();
  await Promise.resolve();

  token.value = "b".repeat(43);
  await session.login({ email: "b@example.edu", password: "password" });

  resolveOld({ context: null });

  await assert.rejects(
    () => pending,
    (error: unknown) =>
      error instanceof ApiRequestError &&
      error.code === "STALE_SESSION_AUTHORITY",
  );
  assert.equal(session.getCredentialSnapshot()?.credential, token.value);
  assert.equal(store.value, token.value);
});

test("subjects forwards the affiliation scope under the same credential authority", async () => {
  const token = { value: "a".repeat(43) };
  const store = new Store();
  const session = new SessionController(sessionApi(token), store);
  await session.login({ email: "a@example.edu", password: "password" });

  let receivedAffiliation: string | undefined;
  const api = new AcademicMobileApi(
    session,
    transport({
      academicSubjects: async (_credential, affiliationId) => {
        receivedAffiliation = affiliationId;
        return { participations: [], truncated: false, limit: 100 };
      },
    }),
  );

  await api.subjects("aff-a");

  assert.equal(receivedAffiliation, "aff-a");
});

test("catalog institution search remains public and forwards the opaque cursor", async () => {
  const token = { value: "a".repeat(43) };
  const session = new SessionController(sessionApi(token), new Store());
  let receivedInput:
    Parameters<AcademicContextTransport["academicCatalogSearch"]>[0] | null =
    null;
  const api = new AcademicMobileApi(
    session,
    transport({
      academicCatalogSearch: async (input) => {
        receivedInput = input;
        return { items: [], nextCursor: null };
      },
    }),
  );

  await api.catalogSearch({
    kind: "institution",
    q: "Universidad",
    limit: 25,
    cursor: "opaque-cursor",
  });

  assert.deepEqual(receivedInput, {
    kind: "institution",
    q: "Universidad",
    limit: 25,
    cursor: "opaque-cursor",
  });
  assert.equal(session.getCredentialSnapshot(), null);
});

test("creating an affiliation uses the active Mobile credential", async () => {
  const token = { value: "a".repeat(43) };
  const store = new Store();
  const session = new SessionController(sessionApi(token), store);
  await session.login({ email: "a@example.edu", password: "password" });
  let receivedCredential = "";
  let receivedInstitution = "";
  const api = new AcademicMobileApi(
    session,
    transport({
      createAcademicAffiliation: async (credential, input) => {
        receivedCredential = credential;
        receivedInstitution = input.institutionId;
        return {
          affiliation: {
            id: "aff-created",
            institutionId: input.institutionId,
            status: input.status,
            roles: ["student"],
            createdAt: "2026-10-01T00:00:00.000Z",
            updatedAt: "2026-10-01T00:00:00.000Z",
          },
        };
      },
    }),
  );

  await api.createAffiliation({
    institutionId: "institution-1",
    status: "active",
  });

  assert.equal(receivedCredential, token.value);
  assert.equal(receivedInstitution, "institution-1");
});
