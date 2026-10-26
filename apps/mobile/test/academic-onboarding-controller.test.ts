import assert from "node:assert/strict";
import test from "node:test";

import type { AcademicCatalogNode } from "@losapuntes/contracts";

import {
  AcademicCatalogSearchController,
  type AcademicCatalogSearchApi,
} from "../src/features/academic/academic-onboarding-controller";

const institution = (id: string, name = id): AcademicCatalogNode => ({
  id,
  kind: "institution",
  name,
  parentIds: [],
  status: "active",
});

const api = (
  overrides: Partial<AcademicCatalogSearchApi> = {},
): AcademicCatalogSearchApi => ({
  catalogSearch: async () => ({ items: [], nextCursor: null }),
  ...overrides,
});

test("institution search trims queries and pages with the opaque cursor", async () => {
  const requests: Array<{
    kind: "institution" | "program" | "subject";
    q: string;
    limit: number;
    cursor?: string;
    parentId?: string;
  }> = [];
  const controller = new AcademicCatalogSearchController(
    api({
      catalogSearch: async (input) => {
        requests.push(input);
        return requests.length === 1
          ? { items: [institution("inst-a")], nextCursor: "opaque-next" }
          : {
              items: [institution("inst-a"), institution("inst-b")],
              nextCursor: null,
            };
      },
    }),
  );
  controller.setAuthority("user-a:session-a");

  await controller.search("user-a:session-a", "  Universidad  ");
  await controller.loadMore("user-a:session-a");

  assert.deepEqual(requests, [
    { kind: "institution", q: "Universidad", limit: 25 },
    {
      kind: "institution",
      q: "Universidad",
      limit: 25,
      cursor: "opaque-next",
    },
  ]);
  const snapshot = controller.getSnapshot();
  assert.equal(snapshot.kind, "ready");
  if (snapshot.kind === "ready") {
    assert.deepEqual(
      snapshot.items.map((item) => item.id),
      ["inst-a", "inst-b"],
    );
  }
});

test("stops a cyclic catalog cursor chain and starts fresh on a repeated search", async () => {
  const cursors: Array<string | undefined> = [];
  const controller = new AcademicCatalogSearchController(
    api({
      catalogSearch: async (input) => {
        cursors.push(input.cursor);
        if (!input.cursor) {
          return { items: [institution("inst-a")], nextCursor: "cursor-a" };
        }
        if (input.cursor === "cursor-a") {
          return {
            items: [institution("inst-b")],
            nextCursor: "cursor-b",
          };
        }
        return { items: [institution("inst-c")], nextCursor: "cursor-a" };
      },
    }),
  );
  controller.setAuthority("user-a:session-a");

  await controller.search("user-a:session-a", "Universidad");
  await controller.loadMore("user-a:session-a");
  await controller.loadMore("user-a:session-a");
  await controller.loadMore("user-a:session-a");

  let snapshot = controller.getSnapshot();
  assert.deepEqual(cursors, [undefined, "cursor-a", "cursor-b"]);
  assert.equal(snapshot.kind, "ready");
  if (snapshot.kind === "ready") {
    assert.deepEqual(
      snapshot.items.map((item) => item.id),
      ["inst-a", "inst-b", "inst-c"],
    );
    assert.equal(snapshot.nextCursor, null);
    assert.equal(snapshot.cursorRepeated, true);
    assert.equal(snapshot.failure, null);
  }

  await controller.search("user-a:session-a", "Universidad");
  await controller.loadMore("user-a:session-a");
  snapshot = controller.getSnapshot();
  assert.deepEqual(cursors, [
    undefined,
    "cursor-a",
    "cursor-b",
    undefined,
    "cursor-a",
  ]);
  assert.equal(snapshot.kind, "ready");
  if (snapshot.kind === "ready") {
    assert.equal(snapshot.nextCursor, "cursor-b");
    assert.equal(snapshot.cursorRepeated, false);
  }
});

test("a failed catalog page can retry its cursor", async () => {
  let pageRequests = 0;
  const controller = new AcademicCatalogSearchController(
    api({
      catalogSearch: async (input) => {
        if (!input.cursor) {
          return { items: [institution("inst-a")], nextCursor: "retry" };
        }
        pageRequests += 1;
        if (pageRequests === 1) throw new Error("temporary failure");
        return { items: [institution("inst-b")], nextCursor: null };
      },
    }),
  );
  controller.setAuthority("user-a:session-a");

  await controller.search("user-a:session-a", "Universidad");
  await controller.loadMore("user-a:session-a");
  let snapshot = controller.getSnapshot();
  assert.equal(snapshot.kind, "ready");
  if (snapshot.kind === "ready") {
    assert.equal(snapshot.nextCursor, "retry");
    assert.equal(snapshot.failure, "unexpected");
    assert.deepEqual(
      snapshot.items.map((item) => item.id),
      ["inst-a"],
    );
  }

  await controller.loadMore("user-a:session-a");
  snapshot = controller.getSnapshot();
  assert.equal(snapshot.kind, "ready");
  if (snapshot.kind === "ready") {
    assert.equal(snapshot.nextCursor, null);
    assert.equal(snapshot.failure, null);
    assert.equal(snapshot.cursorRepeated, false);
    assert.deepEqual(
      snapshot.items.map((item) => item.id),
      ["inst-a", "inst-b"],
    );
  }
  assert.equal(pageRequests, 2);
});

test("program and subject searches stay scoped to the selected parent", async () => {
  const program: AcademicCatalogNode = {
    id: "program-a",
    kind: "program",
    name: "Medicina",
    parentIds: ["inst-a"],
    status: "active",
  };
  const requests: Array<{
    kind: "institution" | "program" | "subject";
    q: string;
    limit: number;
    cursor?: string;
    parentId?: string;
  }> = [];
  const controller = new AcademicCatalogSearchController(
    api({
      catalogSearch: async (input) => {
        requests.push(input);
        return { items: [program], nextCursor: null };
      },
    }),
    "program",
    "inst-a",
  );
  controller.setAuthority("user-a:session-a");

  await controller.search("user-a:session-a", "Medicina");

  assert.deepEqual(requests, [
    {
      kind: "program",
      q: "Medicina",
      limit: 25,
      parentId: "inst-a",
    },
  ]);
  const snapshot = controller.getSnapshot();
  assert.equal(snapshot.kind, "ready");
  if (snapshot.kind === "ready") {
    assert.deepEqual(snapshot.items, [program]);
  }

  const subjectController = new AcademicCatalogSearchController(
    api({
      catalogSearch: async (input) => {
        requests.push(input);
        return { items: [], nextCursor: null };
      },
    }),
    "subject",
    "program-a",
  );
  subjectController.setAuthority("user-a:session-a");
  await subjectController.search("user-a:session-a", "Anatomía");

  assert.deepEqual(requests[1], {
    kind: "subject",
    q: "Anatomía",
    limit: 25,
    parentId: "program-a",
  });
});

test("a search response from the previous session cannot replace the new scope", async () => {
  let resolveSearch!: (response: {
    items: AcademicCatalogNode[];
    nextCursor: string | null;
  }) => void;
  const controller = new AcademicCatalogSearchController(
    api({
      catalogSearch: async () =>
        new Promise((resolve) => {
          resolveSearch = resolve;
        }),
    }),
  );
  controller.setAuthority("user-a:session-a");

  const pending = controller.search("user-a:session-a", "Universidad");
  controller.setAuthority("user-b:session-b");
  resolveSearch({
    items: [institution("private-old-query")],
    nextCursor: null,
  });
  await pending;

  assert.deepEqual(controller.getSnapshot(), {
    kind: "idle",
    authorityKey: "user-b:session-b",
  });
});

test("inactive catalog rows are not offered as selectable institutions", async () => {
  const controller = new AcademicCatalogSearchController(
    api({
      catalogSearch: async () => ({
        items: [
          institution("active-inst"),
          { ...institution("inactive-inst"), status: "inactive" },
        ],
        nextCursor: null,
      }),
    }),
  );
  controller.setAuthority("user-a:session-a");

  await controller.search("user-a:session-a", "Universidad");

  const snapshot = controller.getSnapshot();
  assert.equal(snapshot.kind, "ready");
  if (snapshot.kind === "ready") {
    assert.deepEqual(
      snapshot.items.map((item) => item.id),
      ["active-inst"],
    );
  }
});
