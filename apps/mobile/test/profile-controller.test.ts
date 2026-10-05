import assert from "node:assert/strict";
import test from "node:test";

import type {
  OwnerProfileResponse,
  ProfileActivity,
  UpdateProfileInput,
} from "@losapuntes/contracts";

import type {
  CreateProfileActivityInput,
  MobileProfileApiContract,
} from "../src/features/profile/profile-api";
import {
  MobileProfileController,
  mobileProfileFailure,
} from "../src/features/profile/profile-controller";
import { ApiRequestError } from "../src/services/api/client";

const activity = (id: string): ProfileActivity => ({
  id,
  type: "project",
  title: `Actividad ${id}`,
  description: null,
  url: null,
  startedOn: null,
  endedOn: null,
  revision: 1,
  createdAt: "2026-10-05T00:00:00.000Z",
  updatedAt: "2026-10-05T00:00:00.000Z",
});

const ready = (
  activities: ProfileActivity[] = [activity("a1")],
  activitiesNextCursor: string | null = null,
  revision = 1,
): Extract<OwnerProfileResponse, { onboardingRequired: false }> => ({
  onboardingRequired: false,
  profile: {
    id: "11111111-1111-4111-8111-111111111111",
    displayName: "Ana",
    bio: "Estudiante",
    avatarUrl: null,
    languages: ["es"],
    skills: ["SQL"],
    interests: ["datos"],
    helpTopics: ["álgebra"],
    learningTopics: ["backend"],
    professional: {
      headline: "Estudiante",
      careerDiscoveryOptIn: false,
    },
    presentation: {
      accentPreset: "default",
      coverPreset: "default",
      sectionOrder: [
        "about",
        "academic",
        "learning",
        "activities",
        "skills",
        "professional",
        "contributions",
      ],
    },
    visibility: {
      about: "public",
      academic: "private",
      learning: "private",
      activities: "private",
      skills: "private",
      professional: "private",
      contributions: "private",
    },
    recommendationSignals: {
      academicContext: true,
      learning: true,
      skillsInterests: true,
    },
    revision,
    createdAt: "2026-10-05T00:00:00.000Z",
    updatedAt: "2026-10-05T00:00:00.000Z",
  },
  academic: {
    affiliations: [],
    participations: [],
    currentContext: null,
  },
  activities,
  activitiesNextCursor,
  activitiesLimit: 20,
  contributions: {
    available: false,
    items: [],
  },
});

const onboarding: OwnerProfileResponse = {
  profile: null,
  onboardingRequired: true,
};

const deferred = <T>() => {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
};

const apiStub = (
  overrides: Partial<MobileProfileApiContract> = {},
): MobileProfileApiContract => ({
  me: async () => ready(),
  create: async () => ({ profile: ready().profile }),
  update: async () => ({ profile: ready().profile }),
  activities: async () => ({ items: [], nextCursor: null }),
  createActivity: async () => ({ activity: activity("created") }),
  deleteActivity: async () => undefined,
  ...overrides,
});

test("loads onboarding then creates and rehydrates the canonical owner profile", async () => {
  let meCalls = 0;
  let createName: string | null = null;
  const controller = new MobileProfileController(
    apiStub({
      me: async () => {
        meCalls += 1;
        return meCalls === 1 ? onboarding : ready();
      },
      create: async (displayName) => {
        createName = displayName;
        return { profile: ready().profile };
      },
    }),
  );

  await controller.load("session-a");
  assert.equal(controller.getSnapshot().kind, "onboarding");

  await controller.createProfile("session-a", "Ana");

  assert.equal(createName, "Ana");
  assert.equal(meCalls, 2);
  const snapshot = controller.getSnapshot();
  assert.equal(snapshot.kind, "ready");
  if (snapshot.kind === "ready") {
    assert.equal(snapshot.data.profile.displayName, "Ana");
    assert.equal(snapshot.notice, "Perfil creado.");
  }
});

test("reconciles an ambiguous profile update against server truth before allowing retry", async () => {
  let updateCalls = 0;
  let meCalls = 0;
  const controller = new MobileProfileController(
    apiStub({
      me: async () => {
        meCalls += 1;
        return meCalls === 1 ? ready([], null, 1) : ready([], null, 2);
      },
      update: async (_input: UpdateProfileInput) => {
        updateCalls += 1;
        throw new ApiRequestError(
          "timeout",
          null,
          "REQUEST_TIMEOUT",
          "timeout",
        );
      },
    }),
  );

  await controller.load("session-a");
  await controller.updateProfile("session-a", {
    expectedRevision: 1,
    bio: "Bio nueva",
  });

  assert.equal(updateCalls, 1);
  assert.equal(meCalls, 2);
  const snapshot = controller.getSnapshot();
  assert.equal(snapshot.kind, "ready");
  if (snapshot.kind === "ready") {
    assert.equal(snapshot.data.profile.revision, 2);
    assert.match(snapshot.notice ?? "", /Recargamos el estado confirmado/u);
    assert.equal(snapshot.failure, null);
  }
});

test("principal switch aborts and discards an older profile response", async () => {
  const first = deferred<OwnerProfileResponse>();
  const second = deferred<OwnerProfileResponse>();
  const signals: AbortSignal[] = [];
  let calls = 0;

  const controller = new MobileProfileController(
    apiStub({
      me: async (signal) => {
        calls += 1;
        signals.push(signal!);
        return calls === 1 ? first.promise : second.promise;
      },
    }),
  );

  const oldLoad = controller.load("session-a");
  const currentLoad = controller.load("session-b");

  second.resolve(ready([], null, 2));
  await currentLoad;
  first.resolve(ready([], null, 1));
  await oldLoad;

  assert.equal(signals[0]?.aborted, true);
  const snapshot = controller.getSnapshot();
  assert.equal(snapshot.kind, "ready");
  if (snapshot.kind === "ready") {
    assert.equal(snapshot.authorityKey, "session-b");
    assert.equal(snapshot.data.profile.revision, 2);
  }
});

test("paginates owner activities with id dedupe", async () => {
  const cursors: Array<string | undefined> = [];
  const controller = new MobileProfileController(
    apiStub({
      me: async () => ready([activity("a1"), activity("a2")], "cursor-2"),
      activities: async (cursor) => {
        cursors.push(cursor);
        return {
          items: [activity("a2"), activity("a3")],
          nextCursor: null,
        };
      },
    }),
  );

  await controller.load("session-a");
  await controller.loadMoreActivities("session-a");

  assert.deepEqual(cursors, ["cursor-2"]);
  const snapshot = controller.getSnapshot();
  assert.equal(snapshot.kind, "ready");
  if (snapshot.kind === "ready") {
    assert.deepEqual(
      snapshot.data.activities.map((item) => item.id),
      ["a1", "a2", "a3"],
    );
    assert.equal(snapshot.data.activitiesNextCursor, null);
  }
});

test("activity mutations use canonical snapshots and refresh after commit", async () => {
  const created: CreateProfileActivityInput[] = [];
  const deleted: ProfileActivity[] = [];
  let meCalls = 0;

  const controller = new MobileProfileController(
    apiStub({
      me: async () => {
        meCalls += 1;
        if (meCalls === 1) return ready([activity("a1")]);
        if (meCalls === 2) return ready([activity("a1"), activity("a2")]);
        return ready([activity("a2")]);
      },
      createActivity: async (input) => {
        created.push(input);
        return { activity: activity("a2") };
      },
      deleteActivity: async (item) => {
        deleted.push(item);
      },
    }),
  );

  await controller.load("session-a");
  await controller.createActivity("session-a", {
    type: "project",
    title: "Nuevo proyecto",
  });
  await controller.deleteActivity("session-a", "a1");

  assert.deepEqual(created, [{ type: "project", title: "Nuevo proyecto" }]);
  assert.equal(deleted[0]?.id, "a1");
  assert.equal(deleted[0]?.revision, 1);

  const snapshot = controller.getSnapshot();
  assert.equal(snapshot.kind, "ready");
  if (snapshot.kind === "ready") {
    assert.deepEqual(
      snapshot.data.activities.map((item) => item.id),
      ["a2"],
    );
  }
});

test("profile failures keep conflict and validation distinct from network failures", () => {
  assert.deepEqual(
    mobileProfileFailure(
      new ApiRequestError(
        "conflict",
        409,
        "PROFILE_REVISION_CONFLICT",
        "conflict",
      ),
    ),
    { kind: "conflict", code: "PROFILE_REVISION_CONFLICT" },
  );
  assert.deepEqual(
    mobileProfileFailure(
      new ApiRequestError(
        "validation",
        422,
        "PROFILE_ACTIVITY_PERIOD_INVALID",
        "invalid",
      ),
    ),
    { kind: "validation", code: "PROFILE_ACTIVITY_PERIOD_INVALID" },
  );
});
