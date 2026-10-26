import assert from "node:assert/strict";
import test from "node:test";

import type {
  ResourceShareGrantsPage,
  ResourceView,
  SearchPersonResult,
} from "@losapuntes/contracts";

import { ApiRequestError } from "../src/services/api/client";
import {
  MobileResourceDirectSharingController,
  validSharePeopleQuery,
} from "../src/features/resources/resource-direct-sharing-controller";
import type { ResourceDirectSharingApi } from "../src/features/resources/resource-direct-sharing-api";

function resource(overrides: Partial<ResourceView> = {}): ResourceView {
  return {
    id: "resource-a",
    title: "Álgebra",
    description: null,
    tags: [],
    visibility: "shared",
    revision: 2,
    author: {
      profileId: "author",
      displayName: "Autor",
      avatarUrl: null,
    },
    capabilities: { edit: true, manageShares: true },
    academic: {
      subject: { id: "subject-1", name: "Álgebra" },
      courseOffering: null,
    },
    file: {
      id: "file-a",
      filename: "apunte.pdf",
      mimeType: "application/pdf",
      byteSize: 100,
    },
    createdAt: "2026-10-01T00:00:00.000Z",
    updatedAt: "2026-10-01T00:00:00.000Z",
    ...overrides,
  };
}

const ana: SearchPersonResult = {
  profileId: "profile-a",
  displayName: "Ana",
  avatarUrl: null,
};
const lucia: SearchPersonResult = {
  profileId: "profile-b",
  displayName: "Lucía",
  avatarUrl: null,
};
const self: SearchPersonResult = {
  profileId: "author",
  displayName: "Autor",
  avatarUrl: null,
};

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

function apiStub(
  overrides: Partial<ResourceDirectSharingApi> = {},
): ResourceDirectSharingApi {
  return {
    searchPeople: async () => [ana, lucia],
    listGrants: async () => ({
      items: [],
      nextCursor: null,
      resourceRevision: 2,
    }),
    resource: async () => ({ resource: resource() }),
    grant: async () => ({ shared: true }),
    revoke: async () => undefined,
    ...overrides,
  };
}

async function selectedController(
  overrides: Partial<ResourceDirectSharingApi> = {},
): Promise<MobileResourceDirectSharingController> {
  const controller = new MobileResourceDirectSharingController(
    apiStub(overrides),
  );
  controller.setScope("session-a", resource());
  await controller.search("session-a", "resource-a", "Ana");
  assert.equal(controller.select("session-a", "resource-a", "profile-a"), true);
  return controller;
}

test("people search validates the server's 2-to-120-character contract", () => {
  assert.equal(validSharePeopleQuery(" a "), false);
  assert.equal(validSharePeopleQuery(" Ana "), true);
  assert.equal(validSharePeopleQuery("x".repeat(120)), true);
  assert.equal(validSharePeopleQuery("x".repeat(121)), false);
});

test("search never presents own profile or duplicate recipients", async () => {
  const calls: string[] = [];
  const controller = new MobileResourceDirectSharingController(
    apiStub({
      searchPeople: async (query) => {
        calls.push(query);
        return [self, ana, ana, lucia];
      },
    }),
  );
  controller.setScope("session-a", resource());
  await controller.search("session-a", "resource-a", "  Ana   ");
  const snapshot = controller.getSnapshot();
  assert.equal(snapshot.kind, "ready");
  if (snapshot.kind !== "ready") return;
  assert.deepEqual(
    snapshot.people.map((person) => person.profileId),
    ["profile-a", "profile-b"],
  );
  assert.deepEqual(calls, ["Ana"]);
  assert.equal(controller.select("session-a", "resource-a", "author"), false);
  assert.equal(controller.select("session-a", "resource-a", "profile-a"), true);
});

test("permission to manage shares is required even before searching", async () => {
  let calls = 0;
  const controller = new MobileResourceDirectSharingController(
    apiStub({
      searchPeople: async () => {
        calls += 1;
        return [ana];
      },
    }),
  );
  controller.setScope(
    "session-a",
    resource({
      capabilities: { edit: false, manageShares: false },
    }),
  );
  await controller.search("session-a", "resource-a", "Ana");
  assert.equal(calls, 0);
});

test("private and public resources do not search or mutate recipients", async () => {
  for (const visibility of ["private", "public"] as const) {
    let calls = 0;
    const controller = new MobileResourceDirectSharingController(
      apiStub({
        searchPeople: async () => {
          calls += 1;
          return [ana];
        },
        grant: async () => {
          calls += 1;
          return { shared: true };
        },
      }),
    );
    controller.setScope("session-a", resource({ visibility }));
    await controller.search("session-a", "resource-a", "Ana");
    assert.equal(
      controller.select("session-a", "resource-a", "profile-a"),
      false,
    );
    assert.equal(
      await controller.mutate("session-a", "resource-a", "grant"),
      false,
    );
    assert.equal(calls, 0);
  }
});

test("only a real selected people-search result can receive access", async () => {
  const controller = new MobileResourceDirectSharingController(apiStub());
  controller.setScope("session-a", resource());
  assert.equal(
    controller.select("session-a", "resource-a", "profile-a"),
    false,
  );
  await controller.search("session-a", "resource-a", "Ana");
  assert.equal(
    controller.select("session-a", "resource-a", "forged-profile"),
    false,
  );
  assert.equal(
    await controller.mutate("session-a", "resource-a", "grant"),
    false,
  );
  assert.equal(controller.select("session-a", "resource-a", "profile-a"), true);
});

test("grant preflights the latest resource and requires server acknowledgement", async () => {
  const calls: string[] = [];
  const controller = await selectedController({
    resource: async (id) => {
      calls.push(`GET ${id}`);
      return { resource: resource() };
    },
    grant: async (id, personId) => {
      calls.push(`PUT ${id} ${personId}`);
      return { shared: true };
    },
  });
  assert.equal(
    await controller.mutate("session-a", "resource-a", "grant"),
    true,
  );
  assert.deepEqual(calls, ["GET resource-a", "PUT resource-a profile-a"]);
  const snapshot = controller.getSnapshot();
  assert.equal(snapshot.kind, "ready");
  if (snapshot.kind === "ready") {
    assert.equal(snapshot.outcome, "granted");
    assert.equal(snapshot.selected?.displayName, "Ana");
    assert.equal(snapshot.busy, null);
  }
});

test("revoke requires the same identity guard and a confirmed DELETE", async () => {
  const calls: string[] = [];
  const controller = await selectedController({
    resource: async () => {
      calls.push("GET");
      return { resource: resource() };
    },
    revoke: async (id, personId) => {
      calls.push(`DELETE ${id} ${personId}`);
    },
  });
  assert.equal(
    await controller.mutate("session-a", "resource-a", "revoke"),
    true,
  );
  assert.deepEqual(calls, ["GET", "DELETE resource-a profile-a"]);
  const snapshot = controller.getSnapshot();
  assert.equal(snapshot.kind === "ready" ? snapshot.outcome : null, "revoked");
});

test("a changed visibility or revision stops operations before PUT or DELETE", async () => {
  for (const action of ["grant", "revoke"] as const) {
    let mutationCalls = 0;
    const controller = await selectedController({
      resource: async () => ({
        resource: resource({ visibility: "private", revision: 3 }),
      }),
      grant: async () => {
        mutationCalls += 1;
        return { shared: true };
      },
      revoke: async () => {
        mutationCalls += 1;
      },
    });
    assert.equal(
      await controller.mutate("session-a", "resource-a", action),
      false,
    );
    assert.equal(mutationCalls, 0);
    const snapshot = controller.getSnapshot();
    if (snapshot.kind === "ready") {
      assert.equal(snapshot.outcome, "visibility_changed");
      assert.equal(snapshot.selected, null);
      // Preserve old scope so the panel can explain why a refresh is needed.
      assert.equal(snapshot.revision, 2);
      assert.equal(snapshot.visibility, "shared");
    }
  }
});

test("another session's selection cannot mutate this owner's resource", async () => {
  let calls = 0;
  const controller = await selectedController({
    grant: async () => {
      calls += 1;
      return { shared: true };
    },
  });
  assert.equal(
    await controller.mutate("session-b", "resource-a", "grant"),
    false,
  );
  assert.equal(
    await controller.mutate("session-a", "other-resource", "grant"),
    false,
  );
  assert.equal(calls, 0);
});

test("rapid duplicate taps are fenced to a single pending share mutation", async () => {
  const pending = deferred<{ shared: true }>();
  let mutationCalls = 0;
  const controller = await selectedController({
    grant: async () => {
      mutationCalls += 1;
      return pending.promise;
    },
  });
  const first = controller.mutate("session-a", "resource-a", "grant");
  assert.equal(
    await controller.mutate("session-a", "resource-a", "grant"),
    false,
  );
  pending.resolve({ shared: true });
  assert.equal(await first, true);
  assert.equal(mutationCalls, 1);
});

test("timeout never masquerades as a granted permission or retries automatically", async () => {
  let calls = 0;
  const controller = await selectedController({
    grant: async () => {
      calls += 1;
      throw new ApiRequestError("timeout", null, "TIMEOUT", "Timed out");
    },
  });
  assert.equal(
    await controller.mutate("session-a", "resource-a", "grant"),
    false,
  );
  const snapshot = controller.getSnapshot();
  assert.equal(snapshot.kind, "ready");
  if (snapshot.kind === "ready") {
    assert.equal(snapshot.outcome, "uncertain");
    assert.equal(snapshot.failure, "timeout");
  }
  assert.equal(
    await controller.mutate("session-a", "resource-a", "grant"),
    false,
  );
  assert.equal(calls, 1);
});

test("clearing search text immediately discards selected recipient", async () => {
  const controller = await selectedController();
  controller.clearSearch("session-a", "resource-a");
  const snapshot = controller.getSnapshot();
  assert.equal(snapshot.kind, "ready");
  if (snapshot.kind === "ready") {
    assert.equal(snapshot.searchState, "idle");
    assert.equal(snapshot.selected, null);
    assert.deepEqual(snapshot.people, []);
  }
});

test("late people search cannot overwrite a new query or a new account", async () => {
  const old = deferred<SearchPersonResult[]>();
  const controller = new MobileResourceDirectSharingController(
    apiStub({
      searchPeople: async (query) => (query === "Ana" ? old.promise : [lucia]),
    }),
  );
  controller.setScope("session-a", resource());
  const first = controller.search("session-a", "resource-a", "Ana");
  await controller.search("session-a", "resource-a", "Lucía");
  old.resolve([ana]);
  await first;
  const snapshot = controller.getSnapshot();
  assert.equal(snapshot.kind, "ready");
  if (snapshot.kind === "ready") {
    assert.equal(snapshot.query, "Lucía");
    assert.deepEqual(
      snapshot.people.map((person) => person.profileId),
      ["profile-b"],
    );
  }
  controller.setScope("session-b", resource({ id: "resource-b" }));
  const after = controller.getSnapshot();
  assert.equal(after.kind === "ready" ? after.resourceId : null, "resource-b");
});

test("suspension cancels in-flight share and prevents a stale success message", async () => {
  const pending = deferred<{ shared: true }>();
  const started = deferred<void>();
  let signal: AbortSignal | undefined;
  const controller = await selectedController({
    grant: async (_resourceId, _profileId, nextSignal) => {
      signal = nextSignal;
      started.resolve(undefined);
      return pending.promise;
    },
  });
  const first = controller.mutate("session-a", "resource-a", "grant");
  await started.promise;
  controller.suspend("session-a");
  pending.resolve({ shared: true });
  assert.equal(await first, false);
  assert.equal(signal?.aborted, true);
  const snapshot = controller.getSnapshot();
  assert.equal(
    snapshot.kind === "ready" ? snapshot.outcome : null,
    "uncertain",
  );
});

test("a new revision resets prior search recipients, not just mutation status", async () => {
  const controller = await selectedController();
  controller.setScope("session-a", resource({ revision: 3 }));
  const snapshot = controller.getSnapshot();
  assert.equal(snapshot.kind, "ready");
  if (snapshot.kind !== "ready") {
    return;
  }
  assert.equal(snapshot.revision, 3);
  assert.equal(snapshot.selected, null);
  assert.deepEqual(snapshot.people, []);
  assert.equal(snapshot.outcome, null);
});

test("a stale resource blocks further searches and grants until a fresh GET resets scope", async () => {
  let searches = 0;
  let grants = 0;
  const controller = await selectedController({
    resource: async () => ({
      resource: resource({ visibility: "private", revision: 3 }),
    }),
    searchPeople: async () => {
      searches += 1;
      return [ana];
    },
    grant: async () => {
      grants += 1;
      return { shared: true };
    },
  });
  await controller.mutate("session-a", "resource-a", "grant");
  await controller.search("session-a", "resource-a", "Lucía");
  assert.equal(searches, 1);
  assert.equal(grants, 0);
  let snapshot = controller.getSnapshot();
  assert.equal(
    snapshot.kind === "ready" ? snapshot.outcome : null,
    "visibility_changed",
  );

  controller.setScope(
    "session-a",
    resource({
      visibility: "private",
      revision: 3,
    }),
  );
  snapshot = controller.getSnapshot();
  assert.equal(snapshot.kind, "ready");
  if (snapshot.kind !== "ready") return;
  assert.equal(snapshot.visibility, "private");
  assert.equal(snapshot.outcome, null);
  assert.equal(snapshot.selected, null);
});

test("GET preflight failure never invokes PUT and remains a definite error", async () => {
  let grantCalls = 0;
  const controller = await selectedController({
    resource: async () => {
      throw new ApiRequestError(
        "offline",
        null,
        "NETWORK_UNAVAILABLE",
        "Offline",
      );
    },
    grant: async () => {
      grantCalls += 1;
      return { shared: true };
    },
  });
  assert.equal(
    await controller.mutate("session-a", "resource-a", "grant"),
    false,
  );
  assert.equal(grantCalls, 0);
  const snapshot = controller.getSnapshot();
  assert.equal(snapshot.kind, "ready");
  if (snapshot.kind !== "ready") return;
  assert.equal(snapshot.outcome, "error");
  assert.equal(snapshot.failure, "offline");
});

test("owner receives real paginated grants and can load the next page", async () => {
  const calls: Array<string | undefined> = [];
  const controller = new MobileResourceDirectSharingController(
    apiStub({
      listGrants: async (_resourceId, cursor) => {
        calls.push(cursor);
        return cursor
          ? {
              items: [{ ...lucia, grantedAt: "2026-10-02T12:00:00.000Z" }],
              nextCursor: null,
              resourceRevision: 2,
            }
          : {
              items: [{ ...ana, grantedAt: "2026-10-01T12:00:00.000Z" }],
              nextCursor: "next-page",
              resourceRevision: 2,
            };
      },
    }),
  );
  controller.setScope("session-a", resource());

  await controller.loadGrants("session-a", "resource-a");
  let snapshot = controller.getSnapshot();
  assert.equal(snapshot.kind, "ready");
  if (snapshot.kind !== "ready") return;
  assert.equal(snapshot.grantsState, "ready");
  assert.equal(snapshot.grantsNextCursor, "next-page");
  assert.deepEqual(
    snapshot.grants.map((row) => row.profileId),
    ["profile-a"],
  );

  await controller.loadGrants("session-a", "resource-a", true);
  snapshot = controller.getSnapshot();
  assert.equal(snapshot.kind, "ready");
  if (snapshot.kind !== "ready") return;
  assert.deepEqual(
    snapshot.grants.map((row) => row.profileId),
    ["profile-a", "profile-b"],
  );
  assert.equal(snapshot.grantsNextCursor, null);
  assert.deepEqual(calls, [undefined, "next-page"]);
});

test("a grants cursor cycle retains loaded permissions and requires refresh", async () => {
  const calls: Array<string | undefined> = [];
  const controller = new MobileResourceDirectSharingController(
    apiStub({
      listGrants: async (_resourceId, cursor) => {
        calls.push(cursor);
        if (!cursor) {
          return {
            items: [{ ...ana, grantedAt: "2026-10-01T12:00:00.000Z" }],
            nextCursor: "cursor-a",
            resourceRevision: 2,
          };
        }
        if (cursor === "cursor-a") {
          return {
            items: [{ ...lucia, grantedAt: "2026-10-02T12:00:00.000Z" }],
            nextCursor: "cursor-b",
            resourceRevision: 2,
          };
        }
        return {
          items: [
            { ...lucia, grantedAt: "2026-10-03T12:00:00.000Z" },
            {
              profileId: "profile-c",
              displayName: "Carla",
              avatarUrl: null,
              grantedAt: "2026-10-04T12:00:00.000Z",
            },
          ],
          nextCursor: "cursor-a",
          resourceRevision: 2,
        };
      },
    }),
  );
  controller.setScope("session-a", resource());

  await controller.loadGrants("session-a", "resource-a");
  await controller.loadGrants("session-a", "resource-a", true);
  await controller.loadGrants("session-a", "resource-a", true);
  await controller.loadGrants("session-a", "resource-a", true);

  let snapshot = controller.getSnapshot();
  assert.equal(snapshot.kind, "ready");
  assert.deepEqual(calls, [undefined, "cursor-a", "cursor-b"]);
  if (snapshot.kind !== "ready") return;
  assert.deepEqual(
    snapshot.grants.map((grant) => grant.profileId),
    ["profile-a", "profile-b", "profile-c"],
  );
  assert.equal(snapshot.grantsNextCursor, null);
  assert.equal(snapshot.grantsFailure, "cursor_cycle");

  await controller.loadGrants("session-a", "resource-a");
  snapshot = controller.getSnapshot();
  assert.equal(snapshot.kind, "ready");
  if (snapshot.kind !== "ready") return;
  assert.equal(snapshot.grantsFailure, null);
  assert.equal(snapshot.grantsState, "ready");
  assert.equal(snapshot.grantsNextCursor, "cursor-a");
});

test("a failed grants page keeps its cursor available for retry", async () => {
  let failNextPage = true;
  const calls: Array<string | undefined> = [];
  const controller = new MobileResourceDirectSharingController(
    apiStub({
      listGrants: async (_resourceId, cursor) => {
        calls.push(cursor);
        if (!cursor) {
          return {
            items: [{ ...ana, grantedAt: "2026-10-01T12:00:00.000Z" }],
            nextCursor: "cursor-a",
            resourceRevision: 2,
          };
        }
        if (failNextPage) {
          failNextPage = false;
          throw new ApiRequestError(
            "offline",
            null,
            "NETWORK_UNAVAILABLE",
            "Offline",
          );
        }
        return {
          items: [{ ...lucia, grantedAt: "2026-10-02T12:00:00.000Z" }],
          nextCursor: null,
          resourceRevision: 2,
        };
      },
    }),
  );
  controller.setScope("session-a", resource());

  await controller.loadGrants("session-a", "resource-a");
  await controller.loadGrants("session-a", "resource-a", true);
  let snapshot = controller.getSnapshot();
  assert.equal(snapshot.kind, "ready");
  if (snapshot.kind !== "ready") return;
  assert.equal(snapshot.grantsState, "ready");
  assert.equal(snapshot.grantsNextCursor, "cursor-a");
  assert.equal(snapshot.grantsFailure, "offline");
  assert.deepEqual(
    snapshot.grants.map((grant) => grant.profileId),
    ["profile-a"],
  );

  await controller.loadGrants("session-a", "resource-a", true);
  snapshot = controller.getSnapshot();
  assert.equal(snapshot.kind, "ready");
  if (snapshot.kind !== "ready") return;
  assert.equal(snapshot.grantsNextCursor, null);
  assert.deepEqual(
    snapshot.grants.map((grant) => grant.profileId),
    ["profile-a", "profile-b"],
  );
  assert.deepEqual(calls, [undefined, "cursor-a", "cursor-a"]);
});

test("only a profile returned by the owner grants endpoint can be selected", async () => {
  const controller = new MobileResourceDirectSharingController(
    apiStub({
      listGrants: async () => ({
        items: [{ ...ana, grantedAt: "2026-10-01T12:00:00.000Z" }],
        nextCursor: null,
        resourceRevision: 2,
      }),
    }),
  );
  controller.setScope("session-a", resource());
  assert.equal(
    controller.selectGrant("session-a", "resource-a", "profile-a"),
    false,
  );
  await controller.loadGrants("session-a", "resource-a");
  assert.equal(
    controller.selectGrant("session-a", "resource-a", "forged"),
    false,
  );
  assert.equal(
    controller.selectGrant("session-a", "resource-a", "profile-a"),
    true,
  );
  const snapshot = controller.getSnapshot();
  assert.equal(
    snapshot.kind === "ready" ? snapshot.selected?.displayName : null,
    "Ana",
  );
});

test("revoke from loaded grants uses the existing owner-only preflight and DELETE", async () => {
  const calls: string[] = [];
  let hasGrant = true;
  const controller = new MobileResourceDirectSharingController(
    apiStub({
      listGrants: async () => ({
        items: hasGrant
          ? [{ ...ana, grantedAt: "2026-10-01T12:00:00.000Z" }]
          : [],
        nextCursor: null,
        resourceRevision: 2,
      }),
      resource: async () => {
        calls.push("GET resource");
        return { resource: resource() };
      },
      revoke: async (resourceId, profileId) => {
        calls.push(`DELETE ${resourceId} ${profileId}`);
        hasGrant = false;
      },
    }),
  );
  controller.setScope("session-a", resource());
  await controller.loadGrants("session-a", "resource-a");
  assert.equal(
    controller.selectGrant("session-a", "resource-a", "profile-a"),
    true,
  );
  assert.equal(
    await controller.mutate("session-a", "resource-a", "revoke"),
    true,
  );
  assert.deepEqual(calls, ["GET resource", "DELETE resource-a profile-a"]);

  await controller.loadGrants("session-a", "resource-a");
  const snapshot = controller.getSnapshot();
  assert.equal(snapshot.kind, "ready");
  if (snapshot.kind !== "ready") return;
  assert.deepEqual(snapshot.grants, []);
  assert.equal(snapshot.outcome, "revoked");
});

test("private resources and missing manageShares never query the recipients list", async () => {
  let requests = 0;
  const controller = new MobileResourceDirectSharingController(
    apiStub({
      listGrants: async () => {
        requests += 1;
        return { items: [], nextCursor: null, resourceRevision: 2 };
      },
    }),
  );
  controller.setScope("session-a", resource({ visibility: "private" }));
  await controller.loadGrants("session-a", "resource-a");
  controller.setScope(
    "session-a",
    resource({
      capabilities: { edit: false, manageShares: false },
    }),
  );
  await controller.loadGrants("session-a", "resource-a");
  assert.equal(requests, 0);
});

test("a mismatched grants revision blocks stale operations", async () => {
  const controller = new MobileResourceDirectSharingController(
    apiStub({
      listGrants: async () => ({
        items: [{ ...ana, grantedAt: "2026-10-01T12:00:00.000Z" }],
        nextCursor: null,
        resourceRevision: 3,
      }),
    }),
  );
  controller.setScope("session-a", resource());
  await controller.loadGrants("session-a", "resource-a");
  const snapshot = controller.getSnapshot();
  assert.equal(snapshot.kind, "ready");
  if (snapshot.kind !== "ready") return;
  assert.equal(snapshot.outcome, "visibility_changed");
  assert.deepEqual(snapshot.grants, []);
  assert.equal(
    controller.selectGrant("session-a", "resource-a", "profile-a"),
    false,
  );
});

test("a previous account's delayed page never reaches the new account", async () => {
  const delayed = deferred<ResourceShareGrantsPage>();
  const controller = new MobileResourceDirectSharingController(
    apiStub({
      listGrants: async () => delayed.promise,
    }),
  );
  controller.setScope("session-a", resource());
  const pending = controller.loadGrants("session-a", "resource-a");
  controller.setScope("session-b", resource({ id: "resource-b" }));
  delayed.resolve({
    items: [{ ...ana, grantedAt: "2026-10-01T12:00:00.000Z" }],
    nextCursor: null,
    resourceRevision: 2,
  });
  await pending;
  const snapshot = controller.getSnapshot();
  assert.equal(snapshot.kind, "ready");
  if (snapshot.kind !== "ready") return;
  assert.equal(snapshot.authorityKey, "session-b");
  assert.equal(snapshot.resourceId, "resource-b");
  assert.deepEqual(snapshot.grants, []);
});

test("stale cursor response requires refreshing the authoritative resource", async () => {
  const controller = new MobileResourceDirectSharingController(
    apiStub({
      listGrants: async () => {
        throw new ApiRequestError(
          "conflict",
          409,
          "RESOURCE_SHARES_CURSOR_STALE",
          "Reload grants",
        );
      },
    }),
  );
  controller.setScope("session-a", resource());
  await controller.loadGrants("session-a", "resource-a");
  const snapshot = controller.getSnapshot();
  assert.equal(
    snapshot.kind === "ready" ? snapshot.outcome : null,
    "visibility_changed",
  );
});

test("failed listing reports error without fabricating granted recipients", async () => {
  const controller = new MobileResourceDirectSharingController(
    apiStub({
      listGrants: async () => {
        throw new ApiRequestError(
          "offline",
          null,
          "NETWORK_UNAVAILABLE",
          "Offline",
        );
      },
    }),
  );
  controller.setScope("session-a", resource());
  await controller.loadGrants("session-a", "resource-a");
  const snapshot = controller.getSnapshot();
  assert.equal(snapshot.kind, "ready");
  if (snapshot.kind !== "ready") return;
  assert.equal(snapshot.grantsState, "error");
  assert.equal(snapshot.grantsFailure, "offline");
  assert.deepEqual(snapshot.grants, []);
});
