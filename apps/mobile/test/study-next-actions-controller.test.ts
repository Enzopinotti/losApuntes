import assert from "node:assert/strict";
import test from "node:test";

import { ApiRequestError } from "../src/services/api/client";
import type { StudyNextActions } from "../src/features/study/study-next-actions-api";
import {
  StudyNextActionsController,
  type StudyNextActionsApi,
} from "../src/features/study/study-next-actions-controller";

const actions: StudyNextActions = {
  items: [],
  summary: {
    totalPlans: 0,
    actionablePlans: 0,
    completedPlans: 0,
    emptyPlans: 0,
  },
};

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((res) => {
    resolve = res;
  });
  return { promise, resolve };
}

function setup(overrides: Partial<StudyNextActionsApi> = {}) {
  const calls: AbortSignal[] = [];
  const api: StudyNextActionsApi = {
    get: async (signal) => {
      if (signal) calls.push(signal);
      return actions;
    },
    ...overrides,
  };
  return { controller: new StudyNextActionsController(api), calls };
}

test("loads owner-scoped next actions under the current screen authority", async () => {
  const { controller, calls } = setup();
  await controller.load("user:session");
  const snapshot = controller.getSnapshot();
  assert.equal(calls.length, 1);
  assert.equal(snapshot.kind, "ready");
  if (snapshot.kind === "ready") {
    assert.equal(snapshot.authorityKey, "user:session");
    assert.deepEqual(snapshot.actions.summary, actions.summary);
  }
});

test("closing fences late results and aborts the pending request", async () => {
  const pending = deferred<StudyNextActions>();
  let signal: AbortSignal | undefined;
  const { controller } = setup({
    get: async (requestSignal) => {
      signal = requestSignal;
      return pending.promise;
    },
  });
  const loading = controller.load("user:session");
  controller.close();
  pending.resolve(actions);
  await loading;
  assert.equal(signal?.aborted, true);
  assert.deepEqual(controller.getSnapshot(), { kind: "idle" });
});

test("disabled Study Progress does not create a retry loop", async () => {
  const { controller } = setup({
    get: async () => {
      throw new ApiRequestError(
        "server_unavailable",
        503,
        "STUDY_PROGRESS_NOT_ENABLED",
        "disabled",
      );
    },
  });
  await controller.load("user:session");
  assert.deepEqual(controller.getSnapshot(), {
    kind: "error",
    authorityKey: "user:session",
    message:
      "Los próximos pasos de estudio todavía no están habilitados en el servidor.",
    retryable: false,
  });
});

test("offline failures remain retryable", async () => {
  const { controller } = setup({
    get: async () => {
      throw new ApiRequestError("offline", null, "NETWORK_OFFLINE", "offline");
    },
  });
  await controller.load("user:session");
  const snapshot = controller.getSnapshot();
  assert.equal(snapshot.kind, "error");
  if (snapshot.kind === "error") {
    assert.equal(snapshot.retryable, true);
    assert.match(snapshot.message, /No hay conexión/u);
  }
});
