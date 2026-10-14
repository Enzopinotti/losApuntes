import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import type { ResourceView } from "@losapuntes/contracts";
import { ApiRequestError } from "../src/services/api/client";
import {
  RECENT_OPENED_MEMORY_LIMIT,
  SessionRecentResourceOpens,
} from "../src/features/resources/recent-opened-memory";
import {
  RELATED_SESSION_STUDY_PREVIEW_LIMIT,
  ResourceRelatedSessionController,
} from "../src/features/resources/resource-related-session-controller";
import { savedSubjectQuestionsAction } from "../src/features/resources/saved-subject-questions-action";
import type { ResourceConsumptionApi } from "../src/features/resources/resource-consumption-api";

const subjectA = "11111111-1111-4111-8111-111111111111";
const subjectB = "22222222-2222-4222-8222-222222222222";

function resource(id: string, subjectId = subjectA): ResourceView {
  return {
    id,
    title: `Apunte ${id}`,
    description: null,
    tags: [],
    visibility: "public",
    author: null,
    academic: {
      subject: { id: subjectId, name: subjectId === subjectA ? "Álgebra" : "Física" },
      courseOffering: null,
    },
    file: { id, filename: `${id}.pdf`, mimeType: "application/pdf", byteSize: 512 },
    capabilities: { edit: false, manageShares: false },
    revision: 1,
    createdAt: "2026-10-14T12:00:00.000Z",
    updatedAt: "2026-10-14T12:00:00.000Z",
  };
}

function make(
  memory: SessionRecentResourceOpens,
  resolve: (id: string, signal?: AbortSignal) => Promise<{ resource: ResourceView }>,
) {
  return new ResourceRelatedSessionController(
    { resource: resolve } as Pick<ResourceConsumptionApi, "resource">,
    memory,
  );
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((yes) => { resolve = yes; });
  return { promise, resolve };
}

test("only prior authorized opens in the same Subject appear, excluding the active resource", async () => {
  const memory = new SessionRecentResourceOpens();
  for (const id of ["a-older", "b", "a-newer", "current"]) {
    memory.record("user:session", id);
  }
  const requests: string[] = [];
  const related = make(memory, async (id) => {
    requests.push(id);
    return { resource: resource(id, id === "b" ? subjectB : subjectA) };
  });
  await related.load("detail-scope", "user:session", "current", subjectA);
  const state = related.getSnapshot();
  assert.equal(state.kind, "ready");
  if (state.kind !== "ready") return;
  assert.deepEqual(requests, ["a-newer", "b", "a-older"]);
  assert.deepEqual(state.items.map((item) => item.id), ["a-newer", "a-older"]);
  assert.equal(state.partialFailure, null);
  assert.equal(state.moreAvailable, false);
  assert.deepEqual(memory.read("user:session"), ["current", "a-newer", "b", "a-older"]);
});

test("bounded verified results preserve MRU and never exceed three displayed rows", async () => {
  const memory = new SessionRecentResourceOpens();
  for (let i = 0; i < RECENT_OPENED_MEMORY_LIMIT; i++) memory.record("user:session", `r-${i}`);
  const checks: string[] = [];
  const related = make(memory, async (id) => {
    checks.push(id);
    return { resource: resource(id) };
  });
  await related.load("detail", "user:session", "r-7", subjectA);
  const state = related.getSnapshot();
  assert.equal(state.kind, "ready");
  if (state.kind !== "ready") return;
  assert.equal(RELATED_SESSION_STUDY_PREVIEW_LIMIT, 3);
  assert.deepEqual(state.items.map((item) => item.id), ["r-6", "r-5", "r-4"]);
  assert.equal(state.moreAvailable, true);
  assert.equal(checks.length, RECENT_OPENED_MEMORY_LIMIT - 1);
});

test("revoked and deleted IDs are purged after authorized checks, but not silently rendered", async () => {
  const memory = new SessionRecentResourceOpens();
  for (const id of ["valid", "revoked", "deleted", "current"]) memory.record("session", id);
  const related = make(memory, async (id) => {
    if (id === "revoked") throw new ApiRequestError("forbidden", 403, "RESOURCE_FORBIDDEN", "Forbidden");
    if (id === "deleted") throw new ApiRequestError("unexpected", 404, "RESOURCE_NOT_FOUND", "Missing");
    return { resource: resource(id) };
  });
  await related.load("detail", "session", "current", subjectA);
  const state = related.getSnapshot();
  assert.equal(state.kind, "ready");
  if (state.kind === "ready") assert.deepEqual(state.items.map((x) => x.id), ["valid"]);
  assert.deepEqual(memory.read("session"), ["current", "valid"]);
});

test("partial network errors preserve IDs for retry and never render unverified metadata", async () => {
  const memory = new SessionRecentResourceOpens();
  for (const id of ["valid", "offline", "current"]) memory.record("session", id);
  const related = make(memory, async (id) => {
    if (id === "offline") throw new ApiRequestError("offline", null, "NETWORK_UNAVAILABLE", "Offline");
    return { resource: resource(id) };
  });
  await related.load("detail", "session", "current", subjectA);
  const state = related.getSnapshot();
  assert.equal(state.kind, "ready");
  if (state.kind === "ready") {
    assert.deepEqual(state.items.map((x) => x.id), ["valid"]);
    assert.equal(state.partialFailure, "offline");
  }
  assert.deepEqual(memory.read("session"), ["current", "offline", "valid"]);
});

test("total failure is distinct from a genuinely empty related list", async () => {
  const memory = new SessionRecentResourceOpens();
  memory.record("session", "offline");
  memory.record("session", "current");
  const related = make(memory, async () => {
    throw new ApiRequestError("timeout", null, "REQUEST_TIMEOUT", "Slow");
  });
  await related.load("detail", "session", "current", subjectA);
  assert.deepEqual(related.getSnapshot(), {
    kind: "failure", authorityKey: "detail", reason: "timeout",
  });
  assert.deepEqual(memory.read("session"), ["current", "offline"]);

  related.invalidate("detail");
  memory.clear("session");
  memory.record("session", "current");
  await related.load("detail", "session", "current", subjectA);
  assert.deepEqual(related.getSnapshot(), {
    kind: "ready", authorityKey: "detail", items: [],
    moreAvailable: false, partialFailure: null,
  });
});

test("mismatched response IDs are not presented as verified related resources", async () => {
  const memory = new SessionRecentResourceOpens();
  memory.record("session", "requested");
  memory.record("session", "current");
  const related = make(memory, async () => ({ resource: resource("unexpected") }));
  await related.load("detail", "session", "current", subjectA);
  assert.deepEqual(related.getSnapshot(), {
    kind: "failure", authorityKey: "detail", reason: "error",
  });
  assert.deepEqual(memory.read("session"), ["current", "requested"]);
});

test("changing authority aborts old reads and prevents results or removals crossing sessions", async () => {
  const memory = new SessionRecentResourceOpens();
  memory.record("session-a", "old-id");
  memory.record("session-a", "current-a");
  const pending = deferred<{ resource: ResourceView }>();
  let signal: AbortSignal | undefined;
  let count = 0;
  const related = make(memory, async (id, requestSignal) => {
    count++;
    if (count === 1) {
      signal = requestSignal;
      return pending.promise;
    }
    return { resource: resource(id, subjectB) };
  });
  const stale = related.load("detail-a", "session-a", "current-a", subjectA);
  memory.record("session-b", "new-id");
  memory.record("session-b", "current-b");
  await related.load("detail-b", "session-b", "current-b", subjectB);
  pending.resolve({ resource: resource("old-id") });
  await stale;
  assert.equal(signal?.aborted, true);
  assert.deepEqual(memory.read("session-b"), ["current-b", "new-id"]);
  const state = related.getSnapshot();
  assert.equal(state.kind, "ready");
  if (state.kind === "ready") {
    assert.equal(state.authorityKey, "detail-b");
    assert.deepEqual(state.items.map((x) => x.id), ["new-id"]);
  }
});

test("invalidating the detail cancels requests and hides all previous metadata", async () => {
  const memory = new SessionRecentResourceOpens();
  memory.record("session", "old");
  memory.record("session", "current");
  const pending = deferred<{ resource: ResourceView }>();
  let signal: AbortSignal | undefined;
  const related = make(memory, async (_id, requestSignal) => {
    signal = requestSignal;
    return pending.promise;
  });
  const request = related.load("active-detail", "session", "current", subjectA);
  related.invalidate("active-detail");
  pending.resolve({ resource: resource("old") });
  await request;
  assert.equal(signal?.aborted, true);
  assert.deepEqual(related.getSnapshot(), { kind: "idle" });
});

test("Question CTA uses canonical Subject ID but does not grant publishing access", () => {
  const action = savedSubjectQuestionsAction(resource("current", subjectA));
  assert.deepEqual(action?.href, {
    pathname: "/questions/subjects/[subjectId]",
    params: { subjectId: subjectA },
  });
  assert.match(action?.accessibilityHint ?? "", /servidor vuelve a validar/u);
  assert.equal(savedSubjectQuestionsAction(resource("current", "invalid")), null);
});

test("panel is mounted only inside authorized detail and reuses existing routes", () => {
  const detail = readFileSync(
    new URL("../src/features/resources/resource-details-screen.tsx", import.meta.url),
    "utf8",
  );
  const panel = readFileSync(
    new URL("../src/features/resources/resource-related-session-panel.tsx", import.meta.url),
    "utf8",
  );
  assert.match(detail, /<DetailState/u);
  assert.match(detail, /\{authorityKey \? \(\s*<ResourceRelatedSessionPanel/u);
  assert.match(detail, /currentResource=\{resource\}/u);
  assert.match(panel, /controller\.load\(/u);
  assert.match(panel, /savedSubjectQuestionsAction\(currentResource\)/u);
  assert.match(panel, /pathname: "\/resources\/\[id\]"/u);
  assert.match(panel, /controller\.invalidate\(authorityKey\)/u);
  assert.match(panel, /Se comprueban sus permisos antes de mostrarlos/u);
});
