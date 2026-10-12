import assert from "node:assert/strict";
import test from "node:test";

import type { OwnedResourceStatistics } from "@losapuntes/contracts";
import {
  MobileOwnerStatisticsController,
} from "../src/features/resources/resource-owner-stats-controller";
import type { OwnerStatisticsApi } from "../src/features/resources/resource-owner-stats-api";
import { ApiRequestError } from "../src/services/api/client";

const example: OwnedResourceStatistics = {
  generatedAt: "2026-10-12T12:00:00.000Z",
  publications: { total: 2, private: 1, shared: 1, public: 0 },
  currentSaves: 3,
  activeShareGrants: 1,
  topResources: [{
    id: "r1",
    title: "SQL",
    visibility: "shared",
    saves: 3,
    shareGrants: 1,
  }],
};

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}

test("loads source-backed current counts for one authorized account", async () => {
  const controller = new MobileOwnerStatisticsController({
    getStatistics: async () => example,
  });
  await controller.load("session-1");
  assert.deepEqual(controller.getSnapshot(), {
    kind: "ready",
    authorityKey: "session-1",
    data: example,
  });
});

test("refresh replaces current data instead of adding historical counts", async () => {
  let amount = 3;
  const controller = new MobileOwnerStatisticsController({
    getStatistics: async () => ({ ...example, currentSaves: amount }),
  });
  await controller.load("session-1");
  amount = 2;
  await controller.load("session-1");
  const snapshot = controller.getSnapshot();
  assert.equal(snapshot.kind, "ready");
  if (snapshot.kind !== "ready") return;
  assert.equal(snapshot.data.currentSaves, 2);
});

test("switching account aborts old response and never reveals previous data", async () => {
  const old = deferred<OwnedResourceStatistics>();
  let first = true;
  let oldSignal: AbortSignal | undefined;
  const controller = new MobileOwnerStatisticsController({
    getStatistics: async (signal) => {
      if (first) {
        first = false;
        oldSignal = signal;
        return old.promise;
      }
      return { ...example, currentSaves: 0 };
    },
  });

  const previous = controller.load("session-a");
  await controller.load("session-b");
  old.resolve(example);
  await previous;
  assert.equal(oldSignal?.aborted, true);
  const snapshot = controller.getSnapshot();
  assert.equal(snapshot.kind, "ready");
  if (snapshot.kind !== "ready") return;
  assert.equal(snapshot.authorityKey, "session-b");
  assert.equal(snapshot.data.currentSaves, 0);
});

test("suspension clears private data and fences late responses", async () => {
  const pending = deferred<OwnedResourceStatistics>();
  const controller = new MobileOwnerStatisticsController({
    getStatistics: async () => pending.promise,
  });
  const loading = controller.load("session");
  controller.suspend("session");
  pending.resolve(example);
  await loading;
  assert.deepEqual(controller.getSnapshot(), { kind: "idle" });
});

test("API failure is displayed without fabricating zero counts", async () => {
  const controller = new MobileOwnerStatisticsController({
    getStatistics: async () => {
      throw new ApiRequestError(
        "offline", null, "NETWORK_UNAVAILABLE", "Offline",
      );
    },
  });
  await controller.load("session");
  assert.deepEqual(controller.getSnapshot(), {
    kind: "failure",
    authorityKey: "session",
    failure: "offline",
  });
});

test("failed first load can be retried without keeping the old error", async () => {
  let calls = 0;
  const api: OwnerStatisticsApi = {
    getStatistics: async () => {
      calls += 1;
      if (calls === 1) {
        throw new ApiRequestError("timeout", null, "TIMEOUT", "Timeout");
      }
      return example;
    },
  };
  const controller = new MobileOwnerStatisticsController(api);
  await controller.load("session");
  assert.equal(controller.getSnapshot().kind, "failure");
  await controller.load("session");
  assert.equal(controller.getSnapshot().kind, "ready");
  assert.equal(calls, 2);
});
