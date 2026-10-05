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

  await controller.load("session-a:clubs", { q: "club", type: "club" });
  await controller.loadMore("session-a:clubs");

  assert.deepEqual(inputs, [
    { q: "club", type: "club" },
    { q: "club", type: "club", cursor: "cursor-2" },
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

test("directory principal/filter switch aborts and discards stale results", async () => {
  const first = deferred<{ items: OrganizationCard[]; nextCursor: string | null }>();
  const second = deferred<{ items: OrganizationCard[]; nextCursor: string | null }>();
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
    assert.deepEqual(snapshot.page.items.map((item) => item.id), ["lab"]);
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
  const initial = detail("o1", false, [post("p1"), post("p2")], [
    event("e1"),
    event("e2"),
  ]);
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

test("organization failures distinguish missing, auth, and network states", () => {
  assert.deepEqual(
    mobileOrganizationsFailure(
      new ApiRequestError("unexpected", 404, "ORGANIZATION_NOT_FOUND", "missing"),
    ),
    { kind: "not_found", code: "ORGANIZATION_NOT_FOUND" },
  );
  assert.deepEqual(
    mobileOrganizationsFailure(
      new ApiRequestError("unauthorized", 401, "AUTHENTICATION_REQUIRED", "auth"),
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
