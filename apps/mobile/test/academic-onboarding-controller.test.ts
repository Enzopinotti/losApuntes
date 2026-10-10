import assert from "node:assert/strict";
import test from "node:test";

import type { AcademicCatalogNode } from "@losapuntes/contracts";

import {
  AcademicInstitutionSearchController,
  type AcademicInstitutionSearchApi,
} from "../src/features/academic/academic-onboarding-controller";

const institution = (id: string, name = id): AcademicCatalogNode => ({
  id,
  kind: "institution",
  name,
  parentIds: [],
  status: "active",
});

const api = (
  overrides: Partial<AcademicInstitutionSearchApi> = {},
): AcademicInstitutionSearchApi => ({
  catalogSearch: async () => ({ items: [], nextCursor: null }),
  ...overrides,
});

test("institution search trims queries and pages with the opaque cursor", async () => {
  const requests: Array<{
    kind: "institution";
    q: string;
    limit: number;
    cursor?: string;
  }> = [];
  const controller = new AcademicInstitutionSearchController(
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

test("a search response from the previous session cannot replace the new scope", async () => {
  let resolveSearch!: (response: {
    items: AcademicCatalogNode[];
    nextCursor: string | null;
  }) => void;
  const controller = new AcademicInstitutionSearchController(
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
  const controller = new AcademicInstitutionSearchController(
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
