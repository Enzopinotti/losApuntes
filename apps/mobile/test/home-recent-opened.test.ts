import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import type { ResourceView } from "@losapuntes/contracts";
import { ApiRequestError } from "../src/services/api/client";
import {
  RECENT_OPENED_MEMORY_LIMIT,
  RECENT_OPENED_PREVIEW_LIMIT,
  SessionRecentResourceOpens,
} from "../src/features/resources/recent-opened-memory";
import { HomeRecentOpenedController } from "../src/features/home/home-recent-opened-controller";
import type { ResourceConsumptionApi } from "../src/features/resources/resource-consumption-api";

function resource(id: string): ResourceView {
  return {
    id,
    title: `Apunte ${id}`,
    description: null,
    tags: [],
    visibility: "public",
    author: null,
    academic: {
      subject: { id: "11111111-1111-4111-8111-111111111111", name: "Análisis" },
      courseOffering: null,
    },
    file: {
      id,
      filename: `${id}.pdf`,
      mimeType: "application/pdf",
      byteSize: 512,
    },
    capabilities: { edit: false, manageShares: false },
    revision: 1,
    createdAt: "2026-10-14T12:00:00.000Z",
    updatedAt: "2026-10-14T12:00:00.000Z",
  };
}

function deferred<T>() {
  let resolve!: (result: T) => void;
  const promise = new Promise<T>((yes) => {
    resolve = yes;
  });
  return { promise, resolve };
}

function controller(
  memory: SessionRecentResourceOpens,
  resolve: (
    id: string,
    signal?: AbortSignal,
  ) => Promise<{ resource: ResourceView }>,
) {
  const api = { resource: resolve } as Pick<ResourceConsumptionApi, "resource">;
  return new HomeRecentOpenedController(api, memory);
}

test("records IDs only, bounded to eight; reopens move IDs to the front", () => {
  const memory = new SessionRecentResourceOpens();
  for (let i = 0; i < RECENT_OPENED_MEMORY_LIMIT + 3; i++) {
    memory.record("user:session", `r-${i}`);
  }
  assert.equal(memory.read("user:session").length, RECENT_OPENED_MEMORY_LIMIT);
  assert.deepEqual(memory.read("user:session").slice(0, 2), ["r-10", "r-9"]);
  assert.equal(memory.read("user:session").includes("r-0"), false);
  memory.record("user:session", "r-8");
  assert.deepEqual(memory.read("user:session").slice(0, 2), ["r-8", "r-10"]);
  assert.equal(
    new Set(memory.read("user:session")).size,
    RECENT_OPENED_MEMORY_LIMIT,
  );
});

test("session switches delete previous IDs and null authority does not read content", () => {
  const memory = new SessionRecentResourceOpens();
  memory.record("account-a:session-one", "private-id");
  assert.deepEqual(memory.read(null), []);
  assert.deepEqual(memory.read("account-b:session-two"), []);
  assert.deepEqual(memory.read("account-a:session-one"), []);
  memory.record("account-a:session-one", "new-id");
  memory.clear("different-account:session");
  assert.deepEqual(memory.read("account-a:session-one"), ["new-id"]);
  memory.forget("different-account:session", "new-id");
  assert.deepEqual(memory.read("account-a:session-one"), ["new-id"]);
  memory.clear("account-a:session-one");
  assert.deepEqual(memory.read("account-a:session-one"), []);
});

test("Home reads every resource again before rendering a four-item preview", async () => {
  const memory = new SessionRecentResourceOpens();
  for (let i = 0; i < 6; i++) memory.record("user:session", `r-${i}`);
  const requested: string[] = [];
  const recent = controller(memory, async (id) => {
    requested.push(id);
    return { resource: resource(id) };
  });
  await recent.load("home:context", "user:session");
  const snapshot = recent.getSnapshot();
  assert.equal(snapshot.kind, "ready");
  if (snapshot.kind !== "ready") return;
  assert.equal(RECENT_OPENED_PREVIEW_LIMIT, 4);
  assert.deepEqual(
    snapshot.items.map((r) => r.id),
    ["r-5", "r-4", "r-3", "r-2"],
  );
  assert.equal(snapshot.moreAvailable, true);
  assert.equal(snapshot.partialFailure, null);
  assert.deepEqual(requested, ["r-5", "r-4", "r-3", "r-2", "r-1", "r-0"]);
});

test("removed and no-longer-readable IDs are purged after authorization checks", async () => {
  const memory = new SessionRecentResourceOpens();
  for (const id of ["readable", "revoked", "deleted"])
    memory.record("account:session", id);
  const recent = controller(memory, async (id) => {
    if (id === "revoked")
      throw new ApiRequestError(
        "forbidden",
        403,
        "RESOURCE_FORBIDDEN",
        "No access",
      );
    if (id === "deleted")
      throw new ApiRequestError(
        "unexpected",
        404,
        "RESOURCE_NOT_FOUND",
        "Not found",
      );
    return { resource: resource(id) };
  });
  await recent.load("home-context", "account:session");
  const snapshot = recent.getSnapshot();
  assert.equal(snapshot.kind, "ready");
  if (snapshot.kind === "ready") {
    assert.deepEqual(
      snapshot.items.map((r) => r.id),
      ["readable"],
    );
    assert.equal(snapshot.moreAvailable, false);
  }
  assert.deepEqual(memory.read("account:session"), ["readable"]);
});

test("network errors do not erase IDs and partial results warn about incomplete verification", async () => {
  const memory = new SessionRecentResourceOpens();
  memory.record("account:session", "offline-id");
  memory.record("account:session", "valid-id");
  const recent = controller(memory, async (id) => {
    if (id === "offline-id")
      throw new ApiRequestError(
        "offline",
        null,
        "NETWORK_UNAVAILABLE",
        "No network",
      );
    return { resource: resource(id) };
  });
  await recent.load("home", "account:session");
  const snapshot = recent.getSnapshot();
  assert.equal(snapshot.kind, "ready");
  if (snapshot.kind === "ready") {
    assert.deepEqual(
      snapshot.items.map((r) => r.id),
      ["valid-id"],
    );
    assert.equal(snapshot.partialFailure, "offline");
  }
  assert.deepEqual(memory.read("account:session"), ["valid-id", "offline-id"]);
});

test("all unreachable resources yield failure, not misleading empty state", async () => {
  const memory = new SessionRecentResourceOpens();
  memory.record("user:session", "a");
  const recent = controller(memory, async () => {
    throw new ApiRequestError("timeout", null, "REQUEST_TIMEOUT", "slow");
  });
  await recent.load("home", "user:session");
  assert.deepEqual(recent.getSnapshot(), {
    kind: "failure",
    authorityKey: "home",
    reason: "timeout",
  });
  assert.deepEqual(memory.read("user:session"), ["a"]);
});

test("mismatched resource ID cannot be shown as a verified open", async () => {
  const memory = new SessionRecentResourceOpens();
  memory.record("user:session", "requested");
  const recent = controller(memory, async () => ({
    resource: resource("wrong"),
  }));
  await recent.load("home", "user:session");
  assert.deepEqual(recent.getSnapshot(), {
    kind: "failure",
    authorityKey: "home",
    reason: "error",
  });
});

test("late replies after account/context changes cannot repaint Home or purge another session", async () => {
  const memory = new SessionRecentResourceOpens();
  memory.record("user:a", "id-a");
  const waiting = deferred<{ resource: ResourceView }>();
  let signal: AbortSignal | undefined;
  let calls = 0;
  const recent = controller(memory, async (id, s) => {
    calls++;
    if (calls === 1) {
      signal = s;
      return waiting.promise;
    }
    return { resource: resource(id) };
  });
  const first = recent.load("home:a", "user:a");
  // A new session replaces the memory scope and aborts the old request.
  memory.record("user:b", "id-b");
  await recent.load("home:b", "user:b");
  waiting.resolve({ resource: resource("id-a") });
  await first;
  assert.equal(signal?.aborted, true);
  assert.deepEqual(memory.read("user:b"), ["id-b"]);
  const snapshot = recent.getSnapshot();
  assert.equal(snapshot.kind, "ready");
  if (snapshot.kind === "ready")
    assert.deepEqual(
      snapshot.items.map((r) => r.id),
      ["id-b"],
    );
});

test("clearing history does not touch saved resources or the server, and cancels its operation", async () => {
  const memory = new SessionRecentResourceOpens();
  memory.record("session", "r-1");
  let calls = 0;
  const recent = controller(memory, async (id) => {
    calls++;
    return { resource: resource(id) };
  });
  await recent.load("home", "session");
  recent.clear("wrong-home", "session");
  assert.deepEqual(memory.read("session"), ["r-1"]);
  recent.clear("home", "session");
  assert.deepEqual(memory.read("session"), []);
  assert.deepEqual(recent.getSnapshot(), {
    kind: "ready",
    authorityKey: "home",
    items: [],
    moreAvailable: false,
    partialFailure: null,
  });
  await recent.load("home", "session");
  assert.equal(calls, 1);
});

test("Home and detail wiring gate recent openings on authenticated active detail", () => {
  const detail = readFileSync(
    new URL(
      "../src/features/resources/resource-details-screen.tsx",
      import.meta.url,
    ),
    "utf8",
  );
  const home = readFileSync(
    new URL("../src/features/home/home-screen.tsx", import.meta.url),
    "utf8",
  );
  const card = readFileSync(
    new URL(
      "../src/features/home/home-recent-opened-card.tsx",
      import.meta.url,
    ),
    "utf8",
  );
  assert.match(detail, /snapshot\.kind === "ready"/u);
  assert.match(detail, /snapshot\.authorityKey === authorityKey/u);
  assert.match(detail, /snapshot\.data\.resource\.id === resourceId/u);
  assert.match(
    detail,
    /mobileSessionRecentResourceOpens\.record\(sessionAuthority, resourceId\)/u,
  );
  assert.match(home, /<HomeRecentOpenedCard/u);
  assert.match(home, /sessionAuthorityKey=\{sessionAuthority\}/u);
  assert.match(
    card,
    /controller\.load\(authorityKey, sessionAuthorityKey, preferredSubjectId\)/u,
  );
  assert.match(card, /controller\.clear\(authorityKey, sessionAuthorityKey\)/u);
  assert.match(card, /Los permisos se vuelven a comprobar/u);
});
