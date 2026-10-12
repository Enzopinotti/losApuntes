import assert from "node:assert/strict";
import test from "node:test";

import type { ResourceView, SearchPersonResult } from "@losapuntes/contracts";

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
    academic: { subject: { id: "subject-1", name: "Álgebra" }, courseOffering: null },
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
    resource: async () => ({ resource: resource() }),
    grant: async () => ({ shared: true }),
    revoke: async () => undefined,
    ...overrides,
  };
}

async function selectedController(
  overrides: Partial<ResourceDirectSharingApi> = {},
): Promise<MobileResourceDirectSharingController> {
  const controller = new MobileResourceDirectSharingController(apiStub(overrides));
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
  assert.deepEqual(snapshot.people.map((person) => person.profileId), [
    "profile-a",
    "profile-b",
  ]);
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
  controller.setScope("session-a", resource({
    capabilities: { edit: false, manageShares: false },
  }));
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
    assert.equal(controller.select("session-a", "resource-a", "profile-a"), false);
    assert.equal(await controller.mutate("session-a", "resource-a", "grant"), false);
    assert.equal(calls, 0);
  }
});

test("only a real selected people-search result can receive access", async () => {
  const controller = new MobileResourceDirectSharingController(apiStub());
  controller.setScope("session-a", resource());
  assert.equal(controller.select("session-a", "resource-a", "profile-a"), false);
  await controller.search("session-a", "resource-a", "Ana");
  assert.equal(controller.select("session-a", "resource-a", "forged-profile"), false);
  assert.equal(await controller.mutate("session-a", "resource-a", "grant"), false);
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
  assert.deepEqual(calls, [
    "GET resource-a",
    "PUT resource-a profile-a",
  ]);
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
    assert.equal(await controller.mutate("session-a", "resource-a", action), false);
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
  assert.equal(await controller.mutate("session-b", "resource-a", "grant"), false);
  assert.equal(await controller.mutate("session-a", "other-resource", "grant"), false);
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
  assert.equal(await controller.mutate("session-a", "resource-a", "grant"), false);
  const snapshot = controller.getSnapshot();
  assert.equal(snapshot.kind, "ready");
  if (snapshot.kind === "ready") {
    assert.equal(snapshot.outcome, "uncertain");
    assert.equal(snapshot.failure, "timeout");
  }
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
      searchPeople: async (query) =>
        query === "Ana" ? old.promise : [lucia],
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
    assert.deepEqual(snapshot.people.map((person) => person.profileId), [
      "profile-b",
    ]);
  }
  controller.setScope("session-b", resource({ id: "resource-b" }));
  const after = controller.getSnapshot();
  assert.equal(after.kind === "ready" ? after.resourceId : null, "resource-b");
});

test("suspension cancels in-flight share and prevents a stale success message", async () => {
  const pending = deferred<{ shared: true }>();
  let signal: AbortSignal | undefined;
  const controller = await selectedController({
    grant: async (_resourceId, _profileId, nextSignal) => {
      signal = nextSignal;
      return pending.promise;
    },
  });
  const first = controller.mutate("session-a", "resource-a", "grant");
  // The preflight GET is asynchronous: give it one microtask to resolve.
  await Promise.resolve();
  controller.suspend("session-a");
  pending.resolve({ shared: true });
  assert.equal(await first, false);
  assert.equal(signal?.aborted, true);
  const snapshot = controller.getSnapshot();
  assert.equal(snapshot.kind === "ready" ? snapshot.outcome : null, "uncertain");
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
  assert.equal(snapshot.kind === "ready" ? snapshot.outcome : null, "visibility_changed");

  controller.setScope("session-a", resource({
    visibility: "private",
    revision: 3,
  }));
  snapshot = controller.getSnapshot();
  assert.equal(snapshot.kind, "ready");
  if (snapshot.kind !== "ready") return;
  assert.equal(snapshot.visibility, "private");
  assert.equal(snapshot.outcome, null);
  assert.equal(snapshot.selected, null);
});
