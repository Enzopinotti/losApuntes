import assert from "node:assert/strict";
import test from "node:test";

import type { ResourceView } from "@losapuntes/contracts";
import { ApiRequestError } from "../src/services/api/client";
import {
  MobileResourceMetadataController,
} from "../src/features/resources/resource-metadata-controller";
import { resourceMetadataDraft } from "../src/features/resources/resource-metadata-policy";
import type { ResourceConsumptionApi } from "../src/features/resources/resource-consumption-api";

function resource(
  overrides: Partial<ResourceView> = {},
): ResourceView {
  return {
    id: "r1",
    title: "Original",
    description: "Descripción",
    tags: ["parcial"],
    revision: 2,
    capabilities: { edit: true, manageShares: true },
    visibility: "private",
    author: null,
    academic: { subject: { id: "sub", name: "Álgebra" }, courseOffering: null },
    file: {
      id: "file",
      filename: "notas.pdf",
      mimeType: "application/pdf",
      byteSize: 100,
    },
    createdAt: "2026-10-01T00:00:00.000Z",
    updatedAt: "2026-10-01T00:00:00.000Z",
    ...overrides,
  };
}

const deferred = <T>() => {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
};

function stub(
  overrides: Partial<Pick<ResourceConsumptionApi, "update" | "resource">> = {},
): Pick<ResourceConsumptionApi, "update" | "resource"> {
  return {
    resource: async () => ({ resource: resource() }),
    update: async (_id, input) => ({
      resource: resource({
        revision: input.expectedRevision + 1,
        ...(input.title !== undefined ? { title: input.title } : {}),
        ...(input.description !== undefined ? { description: input.description } : {}),
        ...(input.tags !== undefined ? { tags: input.tags } : {}),
        ...(input.visibility !== undefined
          ? { visibility: input.visibility }
          : {}),
      }),
    }),
    ...overrides,
  };
}

test("only the editable resource scope can submit changes", async () => {
  let writes = 0;
  const controller = new MobileResourceMetadataController(stub({
    update: async () => {
      writes += 1;
      return { resource: resource({ revision: 3, title: "Nuevo" }) };
    },
  }));
  controller.setScope("user-a", resource({ capabilities: { edit: false, manageShares: false } }));
  assert.equal(
    await controller.submit("user-a", "r1", {
      title: "Nuevo", description: "Descripción", tagsText: "parcial",
    }),
    false,
  );
  assert.equal(writes, 0);
  controller.setScope("user-b", resource());
  assert.equal(
    await controller.submit("user-a", "r1", {
      title: "Nuevo", description: "Descripción", tagsText: "parcial",
    }),
    false,
  );
  assert.equal(writes, 0);
});

test("confirmed PATCH updates the displayed revision and is never duplicated", async () => {
  const pending = deferred<{ resource: ResourceView }>();
  const calls: number[] = [];
  const controller = new MobileResourceMetadataController(stub({
    update: async (_id, input) => {
      calls.push(input.expectedRevision);
      return pending.promise;
    },
  }));
  controller.setScope("session", resource());
  const draft = { ...resourceMetadataDraft(resource()), title: "Nuevo" };
  const saving = controller.submit("session", "r1", draft);
  assert.equal(await controller.submit("session", "r1", draft), false);
  assert.equal(controller.getSnapshot().kind, "ready");
  pending.resolve({ resource: resource({ revision: 3, title: "Nuevo" }) });
  assert.equal(await saving, true);
  assert.deepEqual(calls, [2]);
  const snapshot = controller.getSnapshot();
  assert.equal(snapshot.kind, "ready");
  if (snapshot.kind !== "ready") return;
  assert.equal(snapshot.resource.title, "Nuevo");
  assert.equal(snapshot.resource.revision, 3);
  assert.equal(snapshot.busy, null);
  assert.equal(snapshot.outcome, "saved");
  controller.setScope("session", resource());
  const afterLateDetail = controller.getSnapshot();
  if (afterLateDetail.kind === "ready") {
    assert.equal(afterLateDetail.resource.revision, 3);
  }
});

test("conflicting update reconciles from the server without overwriting it", async () => {
  let reads = 0;
  const controller = new MobileResourceMetadataController(stub({
    update: async () => {
      throw new ApiRequestError(
        "conflict", 409, "RESOURCE_REVISION_CONFLICT", "Conflict",
      );
    },
    resource: async () => {
      reads += 1;
      return { resource: resource({ revision: 4, title: "Cambió afuera" }) };
    },
  }));
  controller.setScope("session", resource());
  assert.equal(
    await controller.submit("session", "r1", {
      ...resourceMetadataDraft(resource()), title: "Mi edición",
    }),
    false,
  );
  const snapshot = controller.getSnapshot();
  assert.equal(snapshot.kind, "ready");
  if (snapshot.kind !== "ready") return;
  assert.equal(reads, 1);
  assert.equal(snapshot.outcome, "conflict");
  assert.equal(snapshot.resource.title, "Cambió afuera");
  assert.equal(snapshot.resource.revision, 4);
});

test("timeout after successful PATCH is confirmed by authoritative GET", async () => {
  let reads = 0;
  const controller = new MobileResourceMetadataController(stub({
    update: async () => {
      throw new ApiRequestError("timeout", null, "TIMEOUT", "Timed out");
    },
    resource: async () => {
      reads += 1;
      return { resource: resource({ title: "Nuevo", revision: 3 }) };
    },
  }));
  controller.setScope("session", resource());
  assert.equal(
    await controller.submit("session", "r1", {
      ...resourceMetadataDraft(resource()), title: "Nuevo",
    }),
    true,
  );
  assert.equal(reads, 1);
  const snapshot = controller.getSnapshot();
  assert.equal(snapshot.kind === "ready" ? snapshot.outcome : null, "saved");
});

test("unconfirmed timeout refuses a second PATCH until server is reread", async () => {
  let attempts = 0;
  let readCalls = 0;
  const controller = new MobileResourceMetadataController(stub({
    update: async () => {
      attempts += 1;
      throw new ApiRequestError("timeout", null, "TIMEOUT", "Timed out");
    },
    resource: async () => {
      readCalls += 1;
      if (readCalls === 1) {
        throw new ApiRequestError("offline", null, "NETWORK_UNAVAILABLE", "Offline");
      }
      return { resource: resource({ revision: 3, title: "Otro cambio" }) };
    },
  }));
  controller.setScope("session", resource());
  const draft = { ...resourceMetadataDraft(resource()), title: "Nuevo" };
  assert.equal(await controller.submit("session", "r1", draft), false);
  assert.equal(await controller.submit("session", "r1", draft), false);
  assert.equal(attempts, 1);
  assert.equal(await controller.refresh("session", "r1"), true);
  const snapshot = controller.getSnapshot();
  assert.equal(snapshot.kind === "ready" ? snapshot.outcome : null, "conflict");
  assert.equal(readCalls, 2);
});

test("suspension aborts outstanding changes and marks the outcome uncertain", async () => {
  const pending = deferred<{ resource: ResourceView }>();
  let signal: AbortSignal | undefined;
  const controller = new MobileResourceMetadataController(stub({
    update: async (_id, _patch, nextSignal) => {
      signal = nextSignal;
      return pending.promise;
    },
  }));
  controller.setScope("session", resource());
  const saving = controller.submit("session", "r1", {
    ...resourceMetadataDraft(resource()), title: "Nuevo",
  });
  controller.suspend("session");
  pending.resolve({ resource: resource({ revision: 3, title: "Nuevo" }) });
  assert.equal(await saving, false);
  assert.equal(signal?.aborted, true);
  const snapshot = controller.getSnapshot();
  assert.equal(snapshot.kind === "ready" ? snapshot.outcome : null, "uncertain");
});

test("session switch fences late responses and never exposes former notes", async () => {
  const pending = deferred<{ resource: ResourceView }>();
  const controller = new MobileResourceMetadataController(stub({
    update: async () => pending.promise,
  }));
  controller.setScope("user-a", resource());
  const saving = controller.submit("user-a", "r1", {
    ...resourceMetadataDraft(resource()), title: "Cambió",
  });
  controller.setScope("user-b", resource({ id: "r2", title: "Otro apunte" }));
  pending.resolve({ resource: resource({ revision: 3, title: "Cambió" }) });
  assert.equal(await saving, false);
  const snapshot = controller.getSnapshot();
  assert.equal(snapshot.kind, "ready");
  if (snapshot.kind !== "ready") return;
  assert.equal(snapshot.authorityKey, "user-b");
  assert.equal(snapshot.resource.id, "r2");
  assert.equal(snapshot.resource.title, "Otro apunte");
});

test("unverified PATCH response does not claim success", async () => {
  const controller = new MobileResourceMetadataController(stub({
    update: async () => ({ resource: resource({ revision: 2, title: "Nuevo" }) }),
  }));
  controller.setScope("session", resource());
  assert.equal(
    await controller.submit("session", "r1", {
      ...resourceMetadataDraft(resource()), title: "Nuevo",
    }),
    false,
  );
  const snapshot = controller.getSnapshot();
  assert.equal(snapshot.kind === "ready" ? snapshot.outcome : null, "uncertain");
});

test("visibility PATCH succeeds only with server-confirmed visibility", async () => {
  const changes: string[] = [];
  const controller = new MobileResourceMetadataController(
    stub({
      update: async (id, input) => {
        changes.push(`${id}:${input.expectedRevision}:${input.visibility}`);
        return {
          resource: resource({
            visibility: input.visibility,
            revision: input.expectedRevision + 1,
          }),
        };
      },
    }),
  );
  controller.setScope("session", resource());
  assert.equal(
    await controller.submit("session", "r1", {
      ...resourceMetadataDraft(resource()),
      visibility: "public",
    }),
    true,
  );
  assert.deepEqual(changes, ["r1:2:public"]);
  const snapshot = controller.getSnapshot();
  assert.equal(snapshot.kind, "ready");
  if (snapshot.kind !== "ready") return;
  assert.equal(snapshot.resource.visibility, "public");
  assert.equal(snapshot.resource.revision, 3);
  assert.equal(snapshot.outcome, "saved");
});

test("visibility response mismatch never claims a successful permission change", async () => {
  const controller = new MobileResourceMetadataController(
    stub({
      update: async () => ({
        resource: resource({ revision: 3, visibility: "private" }),
      }),
    }),
  );
  controller.setScope("session", resource());
  assert.equal(
    await controller.submit("session", "r1", {
      ...resourceMetadataDraft(resource()),
      visibility: "public",
    }),
    false,
  );
  const snapshot = controller.getSnapshot();
  assert.equal(snapshot.kind === "ready" ? snapshot.outcome : null, "uncertain");
});

test("concurrent visibility conflict reloads current server access state", async () => {
  const controller = new MobileResourceMetadataController(
    stub({
      update: async () => {
        throw new ApiRequestError(
          "conflict",
          409,
          "RESOURCE_REVISION_CONFLICT",
          "Revision changed",
        );
      },
      resource: async () => ({
        resource: resource({ revision: 5, visibility: "shared" }),
      }),
    }),
  );
  controller.setScope("session", resource());
  assert.equal(
    await controller.submit("session", "r1", {
      ...resourceMetadataDraft(resource()),
      visibility: "public",
    }),
    false,
  );
  const snapshot = controller.getSnapshot();
  assert.equal(snapshot.kind, "ready");
  if (snapshot.kind !== "ready") return;
  assert.equal(snapshot.outcome, "conflict");
  assert.equal(snapshot.resource.visibility, "shared");
  assert.equal(snapshot.resource.revision, 5);
});

test("network ambiguity reconciles visibility instead of blindly retrying", async () => {
  const controller = new MobileResourceMetadataController(
    stub({
      update: async () => {
        throw new ApiRequestError("timeout", null, "TIMEOUT", "Timeout");
      },
      resource: async () => ({
        resource: resource({ revision: 3, visibility: "public" }),
      }),
    }),
  );
  controller.setScope("session", resource());
  assert.equal(
    await controller.submit("session", "r1", {
      ...resourceMetadataDraft(resource()),
      visibility: "public",
    }),
    true,
  );
  const snapshot = controller.getSnapshot();
  assert.equal(snapshot.kind === "ready" ? snapshot.outcome : null, "saved");
});
