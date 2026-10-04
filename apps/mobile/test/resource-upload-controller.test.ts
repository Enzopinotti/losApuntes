import assert from "node:assert/strict";
import test from "node:test";

import type {
  AuthenticatedSessionResponse,
  MobileAuthenticatedSessionResponse,
  PasswordLoginInput,
  ResourceView,
} from "@losapuntes/contracts";

import {
  MobileResourceApi,
  type MobileResourceTransport,
} from "../src/features/resources/resource-api";
import {
  parseResourceTags,
  ResourceUploadController,
  ResourceUploadError,
  resourceFileValidationError,
  type MobileResourceUploadApi,
} from "../src/features/resources/resource-upload-controller";
import { isPermittedUploadIntent } from "../src/features/resources/resource-upload-policy";
import type {
  PickedResourceFile,
  ResourceUploadIntent,
} from "../src/features/resources/resource-types";
import {
  SessionController,
  type SessionApi,
} from "../src/features/session/session-controller";
import type { SessionCredentialStore } from "../src/platform/session-credential-store";
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

const makeSessionApi = (token: string): SessionApi => ({
  mobileLogin: async (
    _input: PasswordLoginInput,
  ): Promise<MobileAuthenticatedSessionResponse> => ({
    user: USER,
    session: SESSION,
    sessionToken: token,
  }),
  me: async (): Promise<AuthenticatedSessionResponse> => ({
    user: USER,
    session: SESSION,
  }),
  logout: async () => undefined,
});

const intent: ResourceUploadIntent = {
  file: {
    id: "asset-1",
    filename: "notes.pdf",
    mimeType: "application/pdf",
    expectedByteSize: 10,
    state: "pending",
  },
  upload: {
    url: "https://storage.example.invalid/signed-capability?signature=hidden",
    method: "PUT",
    headers: { "Content-Type": "application/pdf" },
    expiresAt: "2026-10-04T12:10:00.000Z",
  },
};

const resource: ResourceView = {
  id: "resource-1",
  title: "Notas",
  description: null,
  tags: [],
  visibility: "private",
  author: null,
  academic: {
    subject: { id: "subject-1", name: "Álgebra" },
    courseOffering: null,
  },
  file: {
    id: "asset-1",
    filename: "notes.pdf",
    mimeType: "application/pdf",
    byteSize: 10,
  },
  capabilities: { edit: true, manageShares: false },
  revision: 1,
  createdAt: "2026-10-04T12:00:00.000Z",
  updatedAt: "2026-10-04T12:00:00.000Z",
};

const file = (
  overrides: Partial<PickedResourceFile> = {},
): PickedResourceFile => ({
  uri: "file:///cache/notes.pdf",
  name: "notes.pdf",
  size: 10,
  mimeType: "application/pdf",
  operationKey: "48b1cc7f-dabb-4cf2-b1a7-46aa0899e0b7",
  ...overrides,
});

const input = {
  title: "Notas",
  tags: ["álgebra"],
  subjectId: "subject-1",
  visibility: "private" as const,
};

const makeUploadApi = (
  overrides: Partial<MobileResourceUploadApi> = {},
): MobileResourceUploadApi => ({
  createUploadIntent: async () => intent,
  finalize: async () => undefined,
  create: async () => ({ resource }),
  ...overrides,
});

test("publishes through intent, binary upload, finalize, and private create", async () => {
  const calls: string[] = [];
  const controller = new ResourceUploadController(
    makeUploadApi({
      createUploadIntent: async (metadata) => {
        calls.push(`intent:${metadata.operationKey}`);
        return intent;
      },
      finalize: async (fileId) => {
        calls.push(`finalize:${fileId}`);
      },
      create: async (payload) => {
        calls.push(`create:${payload.visibility}:${payload.subjectId}`);
        assert.equal(payload.assetId, intent.file.id);
        return { resource };
      },
    }),
    async (_file, receivedIntent, onProgress) => {
      calls.push(`put:${receivedIntent.upload.method}`);
      onProgress(60);
    },
  );
  const progress: string[] = [];

  const created = await controller.publish(file(), input, ({ stage }) =>
    progress.push(stage),
  );

  assert.equal(created.resource.id, resource.id);
  assert.deepEqual(calls, [
    `intent:${file().operationKey}`,
    "put:PUT",
    "finalize:asset-1",
    "create:private:subject-1",
  ]);
  assert.deepEqual(progress, [
    "intent",
    "transfer",
    "transfer",
    "finalize",
    "create",
  ]);
});

test("a failed transfer reuses its idempotency key and finalized stages are not repeated", async () => {
  let intentCalls = 0;
  let finalizeCalls = 0;
  let transferCalls = 0;
  let createCalls = 0;
  const controller = new ResourceUploadController(
    makeUploadApi({
      createUploadIntent: async () => {
        intentCalls += 1;
        return intent;
      },
      finalize: async () => {
        finalizeCalls += 1;
      },
      create: async () => {
        createCalls += 1;
        return { resource };
      },
    }),
    async () => {
      transferCalls += 1;
      if (transferCalls === 1) throw new Error("offline");
    },
  );

  await assert.rejects(() => controller.publish(file(), input, () => {}));
  await controller.publish(file(), input, () => {});

  assert.equal(intentCalls, 1);
  assert.equal(transferCalls, 2);
  assert.equal(finalizeCalls, 1);
  assert.equal(createCalls, 1);
});

test("an uncertain resource-create result blocks a duplicate create attempt", async () => {
  let createCalls = 0;
  const controller = new ResourceUploadController(
    makeUploadApi({
      create: async () => {
        createCalls += 1;
        throw new ApiRequestError(
          "timeout",
          null,
          "REQUEST_TIMEOUT",
          "timeout",
        );
      },
    }),
    async () => undefined,
  );

  await assert.rejects(
    () => controller.publish(file(), input, () => {}),
    ApiRequestError,
  );
  await assert.rejects(
    () => controller.publish(file(), input, () => {}),
    (error: unknown) =>
      error instanceof ResourceUploadError &&
      error.code === "RESOURCE_CREATE_OUTCOME_UNCERTAIN",
  );

  assert.equal(createCalls, 1);
});

test("file and tag validation enforces the server upload policy", () => {
  assert.equal(resourceFileValidationError(file()), null);
  assert.equal(
    resourceFileValidationError(file({ mimeType: "text/plain" })),
    "Usá PDF, JPG, PNG o WebP.",
  );
  assert.equal(
    resourceFileValidationError(file({ size: 50 * 1024 * 1024 + 1 })),
    "El archivo supera el máximo de 50 MiB.",
  );
  assert.deepEqual(parseResourceTags(" álgebra, Álgebra, parcial "), [
    "álgebra",
    "parcial",
  ]);
  assert.throws(
    () =>
      parseResourceTags(
        Array.from({ length: 13 }, (_, index) => `t${index}`).join(","),
      ),
    ResourceUploadError,
  );
});

test("storage upload accepts signed HTTPS URLs but never app credentials", () => {
  assert.equal(isPermittedUploadIntent(intent.upload), true);
  assert.equal(
    isPermittedUploadIntent({
      ...intent.upload,
      url: "http://storage.example.invalid/signed-capability",
    }),
    false,
  );
  assert.equal(
    isPermittedUploadIntent({
      ...intent.upload,
      url: "http://localhost:9000/local-signed-capability",
    }),
    true,
  );
  assert.equal(
    isPermittedUploadIntent({
      ...intent.upload,
      headers: { Authorization: "Bearer must-not-leave-the-app-origin" },
    }),
    false,
  );
});

test("resource API calls use only the current session authority", async () => {
  const token = "s".repeat(43);
  const session = new SessionController(
    makeSessionApi(token),
    new MemoryStore(),
  );
  await session.login({ email: USER.email, password: "password" });
  const credentials: string[] = [];
  const transport: MobileResourceTransport = {
    createUploadIntent: async (credential) => {
      credentials.push(credential);
      return intent;
    },
    finalize: async (credential) => {
      credentials.push(credential);
    },
    create: async (credential) => {
      credentials.push(credential);
      return { resource };
    },
  };
  const api = new MobileResourceApi(session, transport);

  await api.createUploadIntent({
    operationKey: file().operationKey,
    filename: file().name,
    mimeType: file().mimeType,
    byteSize: file().size,
  });
  await api.finalize(intent.file.id);
  await api.create({
    ...input,
    assetId: intent.file.id,
  });

  assert.deepEqual(credentials, [token, token, token]);
});
