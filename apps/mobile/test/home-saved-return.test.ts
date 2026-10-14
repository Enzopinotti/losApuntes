import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import type { ResourceView } from "@losapuntes/contracts";

import {
  HOME_SAVED_PREVIEW_LIMIT,
  HomeSavedReturnController,
} from "../src/features/home/home-saved-return-controller";
import { ApiRequestError } from "../src/services/api/client";

function resource(id: string): ResourceView {
  return {
    id,
    title: `Apunte ${id}`,
    description: null,
    tags: [],
    visibility: "public",
    author: null,
    academic: {
      subject: { id: "subject-1", name: "Álgebra" },
      courseOffering: null,
    },
    file: {
      id: `file-${id}`,
      filename: `${id}.pdf`,
      mimeType: "application/pdf",
      byteSize: 512,
    },
    capabilities: { edit: false, manageShares: false },
    revision: 1,
    createdAt: "2026-10-01T12:00:00.000Z",
    updatedAt: "2026-10-01T12:00:00.000Z",
  };
}

function deferred<T>() {
  let resolve!: (result: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}

test("Home preview preserves server save order, deduplicates and limits visible resources", async () => {
  const controller = new HomeSavedReturnController({
    saved: async () => ({
      items: [
        resource("first"),
        resource("second"),
        resource("first"),
        resource("third"),
        resource("fourth"),
      ],
      nextCursor: null,
    }),
  });

  await controller.load("user-a:session-a:context-a");

  assert.deepEqual(controller.getSnapshot(), {
    kind: "ready",
    authorityKey: "user-a:session-a:context-a",
    items: [resource("first"), resource("second"), resource("third")],
    moreAvailable: true,
  });
  assert.equal(HOME_SAVED_PREVIEW_LIMIT, 3);
});

test("an empty authorized page with cursor does not claim the saved library is empty", async () => {
  const controller = new HomeSavedReturnController({
    saved: async () => ({ items: [], nextCursor: "opaque-page" }),
  });
  await controller.load("user-a:session-a:context-a");

  assert.deepEqual(controller.getSnapshot(), {
    kind: "ready",
    authorityKey: "user-a:session-a:context-a",
    items: [],
    moreAvailable: true,
  });
});

test("the preview does not reuse a previous account or academic-context response", async () => {
  const first = deferred<{ items: ResourceView[]; nextCursor: null }>();
  let calls = 0;
  let firstSignal: AbortSignal | undefined;
  const controller = new HomeSavedReturnController({
    saved: async (_cursor, signal) => {
      calls += 1;
      if (calls === 1) {
        firstSignal = signal;
        return first.promise;
      }
      return { items: [resource("b-only")], nextCursor: null };
    },
  });

  const stale = controller.load("user-a:session-a:context-a");
  await controller.load("user-b:session-b:context-b");
  first.resolve({ items: [resource("a-secret")], nextCursor: null });
  await stale;

  assert.equal(firstSignal?.aborted, true);
  const result = controller.getSnapshot();
  assert.equal(result.kind, "ready");
  if (result.kind !== "ready") return;
  assert.equal(result.authorityKey, "user-b:session-b:context-b");
  assert.deepEqual(
    result.items.map((item) => item.id),
    ["b-only"],
  );
});

test("leaving Home clears saved projections and ignores late replies", async () => {
  const pending = deferred<{ items: ResourceView[]; nextCursor: null }>();
  let signal: AbortSignal | undefined;
  const controller = new HomeSavedReturnController({
    saved: async (_cursor, nextSignal) => {
      signal = nextSignal;
      return pending.promise;
    },
  });

  const loading = controller.load("user-a:session-a:context-a");
  controller.invalidate("user-a:session-a:context-a");
  pending.resolve({ items: [resource("secret")], nextCursor: null });
  await loading;

  assert.equal(signal?.aborted, true);
  assert.deepEqual(controller.getSnapshot(), { kind: "idle" });
});

test("invalidating another authority does not erase the current projection", async () => {
  const controller = new HomeSavedReturnController({
    saved: async () => ({ items: [resource("current")], nextCursor: null }),
  });
  await controller.load("user-b");
  controller.invalidate("user-a");
  assert.equal(controller.getSnapshot().kind, "ready");
});

test("offline failure is recoverable and retry requires a successful server response", async () => {
  let calls = 0;
  const controller = new HomeSavedReturnController({
    saved: async () => {
      calls += 1;
      if (calls === 1) {
        throw new ApiRequestError(
          "offline",
          null,
          "NETWORK_UNAVAILABLE",
          "Offline",
        );
      }
      return { items: [resource("now-available")], nextCursor: null };
    },
  });

  await controller.load("user-a");
  assert.deepEqual(controller.getSnapshot(), {
    kind: "failure",
    authorityKey: "user-a",
    reason: "offline",
  });

  await controller.load("user-a");
  const result = controller.getSnapshot();
  assert.equal(result.kind, "ready");
  if (result.kind === "ready") {
    assert.deepEqual(
      result.items.map((item) => item.id),
      ["now-available"],
    );
  }
  assert.equal(calls, 2);
});

test("Home mounts only the bounded, separately authorized preview", () => {
  const screen = readFileSync(
    new URL("../src/features/home/home-screen.tsx", import.meta.url),
    "utf8",
  );
  const component = readFileSync(
    new URL("../src/features/home/home-saved-return-card.tsx", import.meta.url),
    "utf8",
  );

  assert.match(
    screen,
    /<HomeSavedReturnCard authorityKey=\{activeHomeAuthority\} \/>/u,
  );
  assert.match(component, /mobileResourceConsumptionApi/u);
  assert.match(component, /controller\.invalidate\(authorityKey\)/u);
  assert.match(component, /pathname: "\/resources\/\[id\]"/u);
  assert.match(component, /\/saved-resources/u);
  assert.doesNotMatch(component, /AsyncStorage|SecureStore|access\.url/u);
});
