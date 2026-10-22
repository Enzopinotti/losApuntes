import assert from "node:assert/strict";
import test from "node:test";

import {
  HomeHelpOpportunitiesController,
  type HomeHelpOpportunitiesApi,
} from "../src/features/home/home-help-opportunities-controller";

const data = {
  items: [
    {
      subjectId: "bbde8519-5796-429c-b078-7b705edc5a0b",
      subjectName: "Cálculo I",
      unansweredPeerQuestions: 2,
    },
  ],
  hasMoreSubjects: false,
};

test("home help-opportunities controller publishes authorized data and retries", async () => {
  let calls = 0;
  const api: HomeHelpOpportunitiesApi = {
    list: async () => {
      calls += 1;
      if (calls === 1) throw new Error("temporary");
      return data;
    },
  };
  const controller = new HomeHelpOpportunitiesController(api);
  const snapshots: string[] = [];
  controller.subscribe((snapshot) => snapshots.push(snapshot.kind));

  await controller.load("session-a:home");
  assert.deepEqual(controller.getSnapshot(), {
    kind: "error",
    authorityKey: "session-a:home",
  });

  await controller.load("session-a:home");
  assert.deepEqual(controller.getSnapshot(), {
    kind: "ready",
    authorityKey: "session-a:home",
    data,
  });
  assert.deepEqual(snapshots, ["loading", "error", "loading", "ready"]);
});

test("home help-opportunities controller discards a response after authority invalidation", async () => {
  let resolveList = (_value: typeof data) => {};
  const api: HomeHelpOpportunitiesApi = {
    list: () =>
      new Promise((resolve) => {
        resolveList = resolve;
      }),
  };
  const controller = new HomeHelpOpportunitiesController(api);
  const pending = controller.load("session-a:home");
  controller.invalidate("session-a:home");
  resolveList(data);
  await pending;

  assert.deepEqual(controller.getSnapshot(), { kind: "idle" });
});
