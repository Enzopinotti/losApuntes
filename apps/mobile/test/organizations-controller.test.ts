import assert from "node:assert/strict";
import test from "node:test";

import type {
  OrganizationCard,
  OrganizationDetail,
  OrganizationEvent,
  OrganizationPost,
} from "@losapuntes/contracts";

import type {
  MobileOrganizationsApiContract,
  OrganizationDirectoryInput,
} from "../src/features/organizations/organizations-api";
import {
  MobileOrganizationDetailController,
  MobileOrganizationsDirectoryController,
  mobileOrganizationsFailure,
} from "../src/features/organizations/organizations-controller";
import { normalizeOrganizationQuery } from "../src/features/organizations/organizations-input-policy";
import { ApiRequestError } from "../src/services/api/client";

const card = (id: string): OrganizationCard => ({
  id,
  name: `Organización ${id}`,
  type: "club",
  avatarUrl: null,
  verificationState: "unverified",
  institution: { id: "institution-1", name: "UTN" },
  viewer: { following: false },
});

const post = (id: string): OrganizationPost => ({
  id,
  title: `Post ${id}`,
  body: `Contenido ${id}`,
  source: {
    kind: "campus_organization",
    organization: {
      id: "org-1",
      name: "Organización org-1",
      verificationState: "unverified",
    },
  },
  academic: null,
  revision: 1,
  publishedAt: "2026-10-05T00:00:00.000Z",
  updatedAt: "2026-10-05T00:00:00.000Z",
});

const event = (id: string): OrganizationEvent => ({
  id,
  title: `Evento ${id}`,
  description: null,
  startsAt: "2026-10-10T18:00:00.000Z",
  endsAt: null,
  locationLabel: null,
  externalUrl: null,
  state: "scheduled",
  revision: 1,
  createdAt: "2026-10-05T00:00:00.000Z",
  updatedAt: "2026-10-05T00:00:00.000Z",
});

const detail = (
  id: string,
  following = false,
  posts: OrganizationPost[] = [post("p1")],
  events: OrganizationEvent[] = [event("e1")],
): OrganizationDetail => ({
  id,
  name: `Organización ${id}`,
  type: "club",
  about: "Comunidad estudiantil",
  avatarUrl: null,
  coverUrl: null,
  websiteUrl: null,
  claimState: "claimed",
  verificationState: "unverified",
  scope: {
    institution: { id: "institution-1", name: "UTN" },
    campus: null,
    academicUnit: null,
    program: null,
  },
  followerCount: following ? 11 : 10,
  managers: [],
  links: [],
  featuredResources: [],
  posts,
  postsNextCursor: null,
  events,
  eventsNextCursor: null,
  viewer: { following, managementRole: null },
  revision: 1,
  createdAt: "2026-10-05T00:00:00.000Z",
  updatedAt: "2026-10-05T00:00:00.000Z",
});

const apiStub = (
  overrides: Partial<MobileOrganizationsApiContract> = {},
): MobileOrganizationsApiContract => ({
  search: async () => ({ items: [], nextCursor: null }),
  get: async (id) => ({ organization: detail(id) }),
  follow: async () => ({ following: true, changed: true }),
  unfollow: async () => ({ following: false, changed: true }),
  posts: async () => ({ items: [], nextCursor: null }),
  events: async () => ({ items: [], nextCursor: null }),
  ...overrides,
});

const deferred = <T>() => {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
};

test("organization directory appends cursor pages with id dedupe", async () => {
  const inputs: OrganizationDirectoryInput[] = [];
  const controller = new MobileOrganizationsDirectoryController(
    apiStub({
      search: async (input) => {
        inputs.push(input);
        if (!input.cursor) {
          return {
            items: [card("o1"), card("o2")],
            nextCursor: "cursor-2",
          };
        }
        return {
          items: [card("o2"), card("o3")],
          nextCursor: null,
        };
      },
    }),
  );

  await controller.load("session-a:clubs", {
    q: "club",
    type: "club",
    institutionId: "institution-a",
  });
  await controller.loadMore("session-a:clubs");

  assert.deepEqual(inputs, [
    { q: "club", type: "club", institutionId: "institution-a" },
    {
      q: "club",
      type: "club",
      institutionId: "institution-a",
      cursor: "cursor-2",
    },
  ]);

  const snapshot = controller.getSnapshot();
  assert.equal(snapshot.kind, "ready");
  if (snapshot.kind === "ready") {
    assert.deepEqual(
      snapshot.page.items.map((item) => item.id),
      ["o1", "o2", "o3"],
    );
    assert.equal(snapshot.page.nextCursor, null);
  }
});

test("organization directory stops a repeated page cursor", async () => {
  let calls = 0;
  const controller = new MobileOrganizationsDirectoryController(
    apiStub({
      search: async (input) => {
        calls += 1;
        return input.cursor
          ? { items: [card("o2")], nextCursor: input.cursor }
          : { items: [card("o1")], nextCursor: "cursor-2" };
      },
    }),
  );

  await controller.load("session-a:organizations", {});
  await controller.loadMore("session-a:organizations");
  await controller.loadMore("session-a:organizations");

  const snapshot = controller.getSnapshot();
  assert.equal(calls, 2);
  assert.equal(snapshot.kind, "ready");
  if (snapshot.kind === "ready") {
    assert.deepEqual(
      snapshot.page.items.map((item) => item.id),
      ["o1", "o2"],
    );
    assert.equal(snapshot.page.nextCursor, null);
    assert.equal(snapshot.loadingMore, false);
    assert.equal(snapshot.failure?.kind, "server_unavailable");
    assert.equal(
      snapshot.failure?.code,
      "ORGANIZATION_DIRECTORY_CURSOR_REPEATED",
    );
  }
});

test("organization directory stops a cycle that returns to an earlier cursor", async () => {
  const requests: Array<string | undefined> = [];
  const controller = new MobileOrganizationsDirectoryController(
    apiStub({
      search: async (input) => {
        requests.push(input.cursor);
        if (!input.cursor) {
          return { items: [card("o1")], nextCursor: "cursor-a" };
        }
        if (input.cursor === "cursor-a") {
          return { items: [card("o2")], nextCursor: "cursor-b" };
        }
        return { items: [card("o3")], nextCursor: "cursor-a" };
      },
    }),
  );

  await controller.load("session-a:organizations", {});
  await controller.loadMore("session-a:organizations");
  await controller.loadMore("session-a:organizations");

  const snapshot = controller.getSnapshot();
  assert.deepEqual(requests, [undefined, "cursor-a", "cursor-b"]);
  assert.equal(snapshot.kind, "ready");
  if (snapshot.kind === "ready") {
    assert.deepEqual(
      snapshot.page.items.map((item) => item.id),
      ["o1", "o2", "o3"],
    );
    assert.equal(snapshot.page.nextCursor, null);
    assert.equal(snapshot.failure?.kind, "server_unavailable");
  }
});

test("organization directory allows retrying a page after a request failure", async () => {
  let pageAttempts = 0;
  const controller = new MobileOrganizationsDirectoryController(
    apiStub({
      search: async (input) => {
        if (!input.cursor) {
          return { items: [card("o1")], nextCursor: "cursor-2" };
        }
        pageAttempts += 1;
        if (pageAttempts === 1) {
          throw new ApiRequestError(
            "server_unavailable",
            503,
            "TEMPORARY_UNAVAILABLE",
            "temporary failure",
          );
        }
        return { items: [card("o2")], nextCursor: null };
      },
    }),
  );

  await controller.load("session-a:organizations", {});
  await controller.loadMore("session-a:organizations");
  await controller.loadMore("session-a:organizations");

  const snapshot = controller.getSnapshot();
  assert.equal(pageAttempts, 2);
  assert.equal(snapshot.kind, "ready");
  if (snapshot.kind === "ready") {
    assert.deepEqual(
      snapshot.page.items.map((item) => item.id),
      ["o1", "o2"],
    );
    assert.equal(snapshot.page.nextCursor, null);
    assert.equal(snapshot.failure, null);
  }
});

test("directory follow updates the card after the mutation is acknowledged", async () => {
  const pending = deferred<{ following: true; changed: boolean }>();
  let followCalls = 0;
  const controller = new MobileOrganizationsDirectoryController(
    apiStub({
      search: async () => ({ items: [card("org-a")], nextCursor: null }),
      follow: async () => {
        followCalls += 1;
        return pending.promise;
      },
    }),
  );

  await controller.load("session-a:organizations", {});
  const follow = controller.toggleFollow("session-a:organizations", "org-a");
  let snapshot = controller.getSnapshot();
  assert.equal(snapshot.kind, "ready");
  if (snapshot.kind !== "ready") return;
  assert.equal(snapshot.page.items[0]?.viewer?.following, false);
  assert.equal(snapshot.followAction?.status, "loading");

  pending.resolve({ following: true, changed: true });
  await follow;

  snapshot = controller.getSnapshot();
  assert.equal(followCalls, 1);
  assert.equal(snapshot.kind, "ready");
  if (snapshot.kind === "ready") {
    assert.equal(snapshot.page.items[0]?.viewer?.following, true);
    assert.equal(snapshot.followAction?.status, "success");
    assert.equal(
      snapshot.followAction?.message,
      "Ahora seguís Organización org-a.",
    );
  }
});

test("directory unfollow updates the card after the mutation is acknowledged", async () => {
  let followCalls = 0;
  let unfollowCalls = 0;
  const followedCard = { ...card("org-a"), viewer: { following: true } };
  const controller = new MobileOrganizationsDirectoryController(
    apiStub({
      search: async () => ({ items: [followedCard], nextCursor: null }),
      follow: async () => {
        followCalls += 1;
        return { following: true, changed: false };
      },
      unfollow: async () => {
        unfollowCalls += 1;
        return { following: false, changed: true };
      },
    }),
  );

  await controller.load("session-a:organizations", {});
  await controller.toggleFollow("session-a:organizations", "org-a");

  const snapshot = controller.getSnapshot();
  assert.equal(followCalls, 0);
  assert.equal(unfollowCalls, 1);
  assert.equal(snapshot.kind, "ready");
  if (snapshot.kind === "ready") {
    assert.equal(snapshot.page.items[0]?.viewer?.following, false);
    assert.equal(snapshot.followAction?.status, "success");
    assert.equal(
      snapshot.followAction?.message,
      "Dejaste de seguir Organización org-a.",
    );
  }
});

test("ambiguous directory follow reconciles server state without retry", async () => {
  let followCalls = 0;
  let getCalls = 0;
  const controller = new MobileOrganizationsDirectoryController(
    apiStub({
      search: async () => ({ items: [card("org-a")], nextCursor: null }),
      get: async (id) => {
        getCalls += 1;
        return { organization: detail(id, true) };
      },
      follow: async () => {
        followCalls += 1;
        throw new ApiRequestError(
          "timeout",
          null,
          "REQUEST_TIMEOUT",
          "timeout",
        );
      },
    }),
  );

  await controller.load("session-a:organizations", {});
  await controller.toggleFollow("session-a:organizations", "org-a");

  const snapshot = controller.getSnapshot();
  assert.equal(followCalls, 1);
  assert.equal(getCalls, 1);
  assert.equal(snapshot.kind, "ready");
  if (snapshot.kind === "ready") {
    assert.equal(snapshot.page.items[0]?.viewer?.following, true);
    assert.equal(snapshot.followAction?.status, "success");
    assert.match(snapshot.followAction?.message ?? "", /servidor confirma/u);
  }
});

test("directory discards a delayed follow result after the session changes", async () => {
  const pending = deferred<{ following: true; changed: boolean }>();
  const signals: AbortSignal[] = [];
  const controller = new MobileOrganizationsDirectoryController(
    apiStub({
      search: async (_input, signal) => {
        signals.push(signal!);
        return { items: [card("org-a")], nextCursor: null };
      },
      follow: async (_id, signal) => {
        signals.push(signal!);
        return pending.promise;
      },
    }),
  );

  await controller.load("session-a:organizations", {});
  const oldFollow = controller.toggleFollow("session-a:organizations", "org-a");
  await controller.load("session-b:organizations", {});
  pending.resolve({ following: true, changed: true });
  await oldFollow;

  assert.equal(signals[1]?.aborted, true);
  const snapshot = controller.getSnapshot();
  assert.equal(snapshot.kind, "ready");
  if (snapshot.kind === "ready") {
    assert.equal(snapshot.authorityKey, "session-b:organizations");
    assert.equal(snapshot.page.items[0]?.viewer?.following, false);
    assert.equal(snapshot.followAction, null);
  }
});

test("directory principal/filter switch aborts and discards stale results", async () => {
  const first = deferred<{
    items: OrganizationCard[];
    nextCursor: string | null;
  }>();
  const second = deferred<{
    items: OrganizationCard[];
    nextCursor: string | null;
  }>();
  const signals: AbortSignal[] = [];
  let calls = 0;
  const controller = new MobileOrganizationsDirectoryController(
    apiStub({
      search: async (_input, signal) => {
        calls += 1;
        signals.push(signal!);
        return calls === 1 ? first.promise : second.promise;
      },
    }),
  );

  const oldLoad = controller.load("session-a:clubs", { type: "club" });
  const newLoad = controller.load("session-b:labs", { type: "lab" });

  second.resolve({ items: [card("lab")], nextCursor: null });
  await newLoad;
  first.resolve({ items: [card("club")], nextCursor: null });
  await oldLoad;

  assert.equal(signals[0]?.aborted, true);
  const snapshot = controller.getSnapshot();
  assert.equal(snapshot.kind, "ready");
  if (snapshot.kind === "ready") {
    assert.equal(snapshot.authorityKey, "session-b:labs");
    assert.deepEqual(
      snapshot.page.items.map((item) => item.id),
      ["lab"],
    );
  }
});

test("organization detail discards an older entity response after route switch", async () => {
  const first = deferred<{ organization: OrganizationDetail }>();
  const second = deferred<{ organization: OrganizationDetail }>();
  const signals: AbortSignal[] = [];
  let calls = 0;
  const controller = new MobileOrganizationDetailController(
    apiStub({
      get: async (_id, signal) => {
        calls += 1;
        signals.push(signal!);
        return calls === 1 ? first.promise : second.promise;
      },
    }),
  );

  const oldLoad = controller.load("session-a:org:o1", "o1");
  const newLoad = controller.load("session-a:org:o2", "o2");

  second.resolve({ organization: detail("o2") });
  await newLoad;
  first.resolve({ organization: detail("o1") });
  await oldLoad;

  assert.equal(signals[0]?.aborted, true);
  const snapshot = controller.getSnapshot();
  assert.equal(snapshot.kind, "ready");
  if (snapshot.kind === "ready") {
    assert.equal(snapshot.organizationId, "o2");
    assert.equal(snapshot.organization.id, "o2");
  }
});

test("follow mutation reloads canonical organization state", async () => {
  let followed = false;
  let getCalls = 0;
  const controller = new MobileOrganizationDetailController(
    apiStub({
      get: async (id) => {
        getCalls += 1;
        return { organization: detail(id, followed) };
      },
      follow: async () => {
        followed = true;
        return { following: true, changed: true };
      },
    }),
  );

  await controller.load("session-a:org:o1", "o1");
  await controller.toggleFollow("session-a:org:o1", "o1");

  assert.equal(getCalls, 2);
  const snapshot = controller.getSnapshot();
  assert.equal(snapshot.kind, "ready");
  if (snapshot.kind === "ready") {
    assert.equal(snapshot.organization.viewer?.following, true);
    assert.equal(snapshot.organization.followerCount, 11);
    assert.equal(snapshot.notice, "Ahora seguís esta organización.");
  }
});

test("ambiguous follow failure reconciles instead of blindly repeating mutation", async () => {
  let followCalls = 0;
  let getCalls = 0;
  const controller = new MobileOrganizationDetailController(
    apiStub({
      get: async (id) => {
        getCalls += 1;
        return { organization: detail(id, getCalls > 1) };
      },
      follow: async () => {
        followCalls += 1;
        throw new ApiRequestError(
          "timeout",
          null,
          "REQUEST_TIMEOUT",
          "timeout",
        );
      },
    }),
  );

  await controller.load("session-a:org:o1", "o1");
  await controller.toggleFollow("session-a:org:o1", "o1");

  assert.equal(followCalls, 1);
  assert.equal(getCalls, 2);
  const snapshot = controller.getSnapshot();
  assert.equal(snapshot.kind, "ready");
  if (snapshot.kind === "ready") {
    assert.equal(snapshot.organization.viewer?.following, true);
    assert.match(snapshot.notice ?? "", /estado confirmado por el servidor/u);
  }
});

test("detail paginates posts and events with id dedupe", async () => {
  const initial = detail(
    "o1",
    false,
    [post("p1"), post("p2")],
    [event("e1"), event("e2")],
  );
  initial.postsNextCursor = "posts-2";
  initial.eventsNextCursor = "events-2";

  const controller = new MobileOrganizationDetailController(
    apiStub({
      get: async () => ({ organization: initial }),
      posts: async () => ({
        items: [post("p2"), post("p3")],
        nextCursor: null,
      }),
      events: async () => ({
        items: [event("e2"), event("e3")],
        nextCursor: null,
      }),
    }),
  );

  await controller.load("session-a:org:o1", "o1");
  await controller.loadMorePosts("session-a:org:o1", "o1");
  await controller.loadMoreEvents("session-a:org:o1", "o1");

  const snapshot = controller.getSnapshot();
  assert.equal(snapshot.kind, "ready");
  if (snapshot.kind === "ready") {
    assert.deepEqual(
      snapshot.organization.posts.map((item) => item.id),
      ["p1", "p2", "p3"],
    );
    assert.deepEqual(
      snapshot.organization.events.map((item) => item.id),
      ["e1", "e2", "e3"],
    );
    assert.equal(snapshot.organization.postsNextCursor, null);
    assert.equal(snapshot.organization.eventsNextCursor, null);
  }
});

test("upcoming events use the server date filter and keep their cursor isolated", async () => {
  const initial = detail("o1", false, [post("p1")], [event("all-event")]);
  initial.eventsNextCursor = "all-next";
  const eventRequests: Array<{
    cursor: string | undefined;
    from: string | undefined;
  }> = [];
  const controller = new MobileOrganizationDetailController(
    apiStub({
      get: async () => ({ organization: initial }),
      events: async (_id, cursor, _signal, from) => {
        eventRequests.push({ cursor, from });
        return cursor
          ? { items: [event("future-2")], nextCursor: null }
          : { items: [event("future-1")], nextCursor: "future-next" };
      },
    }),
  );

  await controller.load("session-a:org:o1", "o1");
  await controller.loadUpcomingEvents("session-a:org:o1", "o1");

  let snapshot = controller.getSnapshot();
  assert.equal(snapshot.kind, "ready");
  if (snapshot.kind !== "ready") return;
  assert.equal(snapshot.eventView, "upcoming");
  assert.deepEqual(
    snapshot.upcomingEvents.map((item) => item.id),
    ["future-1"],
  );
  assert.deepEqual(
    snapshot.organization.events.map((item) => item.id),
    ["all-event"],
  );
  assert.equal(snapshot.organization.eventsNextCursor, "all-next");
  assert.equal(snapshot.upcomingEventsNextCursor, "future-next");
  assert.ok(Number.isFinite(Date.parse(eventRequests[0]!.from!)));

  await controller.loadMoreEvents("session-a:org:o1", "o1");
  snapshot = controller.getSnapshot();
  assert.equal(snapshot.kind, "ready");
  if (snapshot.kind !== "ready") return;
  assert.deepEqual(
    snapshot.upcomingEvents.map((item) => item.id),
    ["future-1", "future-2"],
  );
  assert.deepEqual(eventRequests[1], {
    cursor: "future-next",
    from: undefined,
  });

  controller.showAllEvents("session-a:org:o1", "o1");
  snapshot = controller.getSnapshot();
  assert.equal(snapshot.kind, "ready");
  if (snapshot.kind === "ready") {
    assert.equal(snapshot.eventView, "all");
    assert.deepEqual(
      snapshot.organization.events.map((item) => item.id),
      ["all-event"],
    );
    assert.equal(snapshot.organization.eventsNextCursor, "all-next");
  }
});

test("organization search query policy mirrors the server 2-120 contract", () => {
  assert.deepEqual(normalizeOrganizationQuery("  "), { ok: true, query: "" });
  assert.deepEqual(normalizeOrganizationQuery("  GIDAS  "), {
    ok: true,
    query: "GIDAS",
  });

  const tooShort = normalizeOrganizationQuery("g");
  assert.equal(tooShort.ok, false);
  if (!tooShort.ok) assert.match(tooShort.message, /al menos 2/u);

  const tooLong = normalizeOrganizationQuery("x".repeat(121));
  assert.equal(tooLong.ok, false);
  if (!tooLong.ok) assert.match(tooLong.message, /120/u);
});

test("organization failures distinguish missing, auth, and network states", () => {
  assert.deepEqual(
    mobileOrganizationsFailure(
      new ApiRequestError(
        "unexpected",
        404,
        "ORGANIZATION_NOT_FOUND",
        "missing",
      ),
    ),
    { kind: "not_found", code: "ORGANIZATION_NOT_FOUND" },
  );
  assert.deepEqual(
    mobileOrganizationsFailure(
      new ApiRequestError(
        "unauthorized",
        401,
        "AUTHENTICATION_REQUIRED",
        "auth",
      ),
    ),
    { kind: "auth_required", code: "AUTHENTICATION_REQUIRED" },
  );
  assert.deepEqual(
    mobileOrganizationsFailure(
      new ApiRequestError("offline", null, "NETWORK_UNAVAILABLE", "offline"),
    ),
    { kind: "offline", code: "NETWORK_UNAVAILABLE" },
  );
});
