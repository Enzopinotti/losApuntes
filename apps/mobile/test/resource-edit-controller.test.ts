import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import type { ResourceView } from "@losapuntes/contracts";

import { ApiRequestError } from "../src/services/api/client";
import { MobileResourceEditController } from "../src/features/resources/resource-edit-controller";
import type { ResourceEditApi } from "../src/features/resources/resource-edit-api";
import { resourceEditDraft } from "../src/features/resources/resource-edit-policy";

function resource(
  id: string,
  revision = 3,
  canEdit = true,
): ResourceView {
  return {
    id,
    title: "Álgebra",
    description: null,
    tags: [],
    visibility: "private",
    author: null,
    academic: {
      subject: { id: "subject-a", name: "Álgebra I" },
      courseOffering: null,
    },
    file: {
      id: "file-a",
      filename: "guia.pdf",
      mimeType: "application/pdf",
      byteSize: 10,
    },
    capabilities: { edit: canEdit, manageShares: canEdit },
    revision,
    createdAt: "2026-10-01T00:00:00Z",
    updatedAt: "2026-10-01T00:00:00Z",
  };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((yes) => {
    resolve = yes;
  });
  return { promise, resolve };
}

function draftWithTitle(item: ResourceView, title: string) {
  return { ...resourceEditDraft(item), title };
}

test("owner edit sends server revision and publishes only acknowledged data", async () => {
  const original = resource("resource-a");
  const updated = { ...original, title: "Resumen", revision: 4 };
  const calls: unknown[] = [];
  const api: ResourceEditApi = {
    update: async (id, patch) => {
      calls.push({ id, patch });
      return { resource: updated };
    },
  };
  const controller = new MobileResourceEditController(api);
  controller.setScope("user-a", original);
  assert.deepEqual(
    await controller.submit(
      "user-a",
      original.id,
      draftWithTitle(original, "Resumen"),
    ),
    updated,
  );
  assert.deepEqual(calls, [
    {
      id: "resource-a",
      patch: { expectedRevision: 3, title: "Resumen" },
    },
  ]);
  const snapshot = controller.getSnapshot();
  assert.equal(snapshot.kind, "ready");
  if (snapshot.kind === "ready") {
    assert.equal(snapshot.outcome, "saved");
    assert.equal(snapshot.resource.revision, 4);
    assert.equal(snapshot.sending, false);
  }
});

test("uneditable, missing and wrong-authority resources never dispatch PATCH", async () => {
  let calls = 0;
  const controller = new MobileResourceEditController({
    update: async (_id) => {
      calls += 1;
      return { resource: resource("resource-a") };
    },
  });
  const item = resource("resource-a", 3, false);
  controller.setScope("user-a", item);

  assert.equal(
    await controller.submit("user-a", item.id, draftWithTitle(item, "Nuevo")),
    null,
  );
  assert.equal(
    await controller.submit("user-b", item.id, draftWithTitle(item, "Nuevo")),
    null,
  );
  assert.equal(
    await controller.submit("user-a", "missing", draftWithTitle(item, "Nuevo")),
    null,
  );
  assert.equal(calls, 0);
});

test("duplicate taps cannot create two concurrent writes", async () => {
  const item = resource("resource-a");
  const pending = deferred<{ resource: ResourceView }>();
  let calls = 0;
  const controller = new MobileResourceEditController({
    update: async () => {
      calls += 1;
      return pending.promise;
    },
  });
  controller.setScope("user-a", item);

  const saving = controller.submit(
    "user-a",
    item.id,
    draftWithTitle(item, "Nuevo"),
  );
  assert.equal(
    await controller.submit("user-a", item.id, draftWithTitle(item, "Otro")),
    null,
  );
  pending.resolve({ resource: { ...item, title: "Nuevo", revision: 4 } });
  assert.equal((await saving)?.revision, 4);
  assert.equal(calls, 1);
});

test("optimistic revision conflict blocks resending stale updates", async () => {
  const item = resource("resource-a");
  let calls = 0;
  const controller = new MobileResourceEditController({
    update: async () => {
      calls += 1;
      throw new ApiRequestError(
        "conflict",
        409,
        "RESOURCE_REVISION_CONFLICT",
        "Already changed",
      );
    },
  });
  controller.setScope("user-a", item);

  assert.equal(
    await controller.submit("user-a", item.id, draftWithTitle(item, "Nuevo")),
    null,
  );
  assert.equal(controller.getSnapshot().kind, "ready");
  const snapshot = controller.getSnapshot();
  if (snapshot.kind === "ready") {
    assert.equal(snapshot.outcome, "conflict");
    assert.equal(snapshot.sending, false);
  }
  assert.equal(
    await controller.submit("user-a", item.id, draftWithTitle(item, "Otro")),
    null,
  );
  assert.equal(calls, 1);
});

test("timeout has uncertain outcome, preventing blind repeated writes", async () => {
  const item = resource("resource-a");
  let calls = 0;
  const controller = new MobileResourceEditController({
    update: async () => {
      calls += 1;
      throw new ApiRequestError("timeout", null, "TIMEOUT", "Timeout");
    },
  });
  controller.setScope("user-a", item);
  assert.equal(
    await controller.submit("user-a", item.id, draftWithTitle(item, "Nuevo")),
    null,
  );
  const snapshot = controller.getSnapshot();
  assert.equal(snapshot.kind, "ready");
  if (snapshot.kind === "ready") assert.equal(snapshot.outcome, "uncertain");
  assert.equal(
    await controller.submit("user-a", item.id, draftWithTitle(item, "Otro")),
    null,
  );
  assert.equal(calls, 1);
});

test("validation errors keep draft retryable without claiming success", async () => {
  const item = resource("resource-a");
  let calls = 0;
  const controller = new MobileResourceEditController({
    update: async () => {
      calls += 1;
      if (calls === 1) {
        throw new ApiRequestError(
          "validation",
          422,
          "INVALID_RESOURCE",
          "Invalid",
        );
      }
      return { resource: { ...item, title: "Nuevo", revision: 4 } };
    },
  });
  controller.setScope("user-a", item);
  assert.equal(
    await controller.submit("user-a", item.id, draftWithTitle(item, "Nuevo")),
    null,
  );
  const snapshot = controller.getSnapshot();
  assert.equal(snapshot.kind, "ready");
  if (snapshot.kind === "ready") {
    assert.equal(snapshot.outcome, "none");
    assert.equal(snapshot.failure, "validation");
  }
  assert.equal(
    (await controller.submit("user-a", item.id, draftWithTitle(item, "Nuevo")))
      ?.revision,
    4,
  );
  assert.equal(calls, 2);
});

test("account switch aborts old request and ignores late acknowledgement", async () => {
  const item = resource("resource-a");
  const pending = deferred<{ resource: ResourceView }>();
  let signal: AbortSignal | undefined;
  const controller = new MobileResourceEditController({
    update: async (_id, _patch, nextSignal) => {
      signal = nextSignal;
      return pending.promise;
    },
  });
  controller.setScope("user-a", item);
  const saving = controller.submit(
    "user-a",
    item.id,
    draftWithTitle(item, "Nuevo"),
  );
  controller.setScope("user-b", resource("resource-b"));
  pending.resolve({
    resource: { ...item, title: "Nuevo", revision: 4 },
  });

  assert.equal(await saving, null);
  assert.equal(signal?.aborted, true);
  const snapshot = controller.getSnapshot();
  assert.equal(snapshot.kind, "ready");
  if (snapshot.kind === "ready") {
    assert.equal(snapshot.authorityKey, "user-b");
    assert.equal(snapshot.resource.id, "resource-b");
    assert.equal(snapshot.outcome, "none");
  }
});

test("background suspension aborts write and blocks uncertain retry", async () => {
  const item = resource("resource-a");
  const pending = deferred<{ resource: ResourceView }>();
  let calls = 0;
  let signal: AbortSignal | undefined;
  const controller = new MobileResourceEditController({
    update: async (_id, _patch, nextSignal) => {
      calls += 1;
      signal = nextSignal;
      return pending.promise;
    },
  });
  controller.setScope("user-a", item);
  const saving = controller.submit(
    "user-a",
    item.id,
    draftWithTitle(item, "Nuevo"),
  );
  controller.suspend("user-a");
  pending.resolve({
    resource: { ...item, title: "Nuevo", revision: 4 },
  });

  assert.equal(await saving, null);
  assert.equal(signal?.aborted, true);
  controller.setScope("user-a", item);
  const snapshot = controller.getSnapshot();
  assert.equal(snapshot.kind, "ready");
  if (snapshot.kind === "ready") {
    assert.equal(snapshot.outcome, "uncertain");
    assert.equal(snapshot.sending, false);
  }
  assert.equal(
    await controller.submit("user-a", item.id, draftWithTitle(item, "Nuevo")),
    null,
  );
  assert.equal(calls, 1);
});

test("fresh higher revision restores editing after stale-resource conflict", async () => {
  const item = resource("resource-a");
  const controller = new MobileResourceEditController({
    update: async () => {
      throw new ApiRequestError("conflict", 409, "RESOURCE_REVISION_CONFLICT", "Changed");
    },
  });
  controller.setScope("user-a", item);
  await controller.submit("user-a", item.id, draftWithTitle(item, "Nuevo"));
  controller.setScope("user-a", { ...item, revision: 8, title: "De otro autor" });
  const snapshot = controller.getSnapshot();
  assert.equal(snapshot.kind, "ready");
  if (snapshot.kind === "ready") {
    assert.equal(snapshot.outcome, "none");
    assert.equal(snapshot.resource.revision, 8);
  }
});

test("UI exposes owner authorization, visible fields and server-refresh recovery", () => {
  const panel = readFileSync(
    new URL("../src/features/resources/resource-edit-panel.tsx", import.meta.url),
    "utf8",
  );
  const details = readFileSync(
    new URL("../src/features/resources/resource-details-screen.tsx", import.meta.url),
    "utf8",
  );
  const api = readFileSync(
    new URL("../src/features/resources/resource-edit-api.ts", import.meta.url),
    "utf8",
  );
  assert.match(panel, /resource\.capabilities\.edit/u);
  assert.match(panel, /validateResourceEdit/u);
  assert.match(panel, /Editar mi apunte/u);
  assert.match(panel, /Actualizar recurso/u);
  assert.match(details, /<ResourceEditPanel/u);
  assert.match(api, /method: "PATCH"/u);
  assert.match(api, /isCredentialAuthoritative/u);
});
