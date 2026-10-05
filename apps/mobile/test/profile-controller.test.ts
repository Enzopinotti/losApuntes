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
import {
  parseProfileHeadline,
  parseProfileListInput,
  profileListInputCapacity,
} from "../src/features/profile/profile-input-policy";
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
  const createResult = await controller.createActivity("session-a", {
    type: "project",
    title: "Nuevo proyecto",
  });
  assert.equal(createResult, "committed");
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

test("ambiguous activity create reports reconciliation instead of a committed result", async () => {
  let meCalls = 0;
  const controller = new MobileProfileController(
    apiStub({
      me: async () => {
        meCalls += 1;
        return meCalls === 1
          ? ready([activity("a1")])
          : ready([activity("a1"), activity("a2")]);
      },
      createActivity: async () => {
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
  const result = await controller.createActivity("session-a", {
    type: "project",
    title: "Proyecto ambiguo",
  });

  assert.equal(result, "reconciled");
  const snapshot = controller.getSnapshot();
  assert.equal(snapshot.kind, "ready");
  if (snapshot.kind === "ready") {
    assert.deepEqual(
      snapshot.data.activities.map((item) => item.id),
      ["a1", "a2"],
    );
  }
});

test("suspended activity create reports cancelled so the UI can preserve its draft", async () => {
  const pending = deferred<{ activity: ProfileActivity }>();
  let signal: AbortSignal | undefined;
  const controller = new MobileProfileController(
    apiStub({
      createActivity: async (_input, nextSignal) => {
        signal = nextSignal;
        return pending.promise;
      },
    }),
  );

  await controller.load("session-a");
  const request = controller.createActivity("session-a", {
    type: "project",
    title: "Proyecto en vuelo",
  });

  controller.suspend("session-a");
  pending.resolve({ activity: activity("created") });

  assert.equal(await request, "cancelled");
  assert.equal(signal?.aborted, true);
});

test("profile list input policy matches server count and item-length limits", () => {
  assert.deepEqual(parseProfileListInput("languages", "es, en, es"), {
    ok: true,
    values: ["es", "en"],
  });

  const tooManyLanguages = parseProfileListInput(
    "languages",
    Array.from({ length: 11 }, (_, index) => `l${index}`).join(","),
  );
  assert.equal(tooManyLanguages.ok, false);
  if (!tooManyLanguages.ok) {
    assert.match(tooManyLanguages.message, /máximo 10/u);
  }

  const longSkill = parseProfileListInput("skills", "x".repeat(61));
  assert.equal(longSkill.ok, false);
  if (!longSkill.ok) {
    assert.match(longSkill.message, /entre 1 y 60/u);
  }

  const tooManyTopics = parseProfileListInput(
    "learningTopics",
    Array.from({ length: 21 }, (_, index) => `tema ${index}`).join(","),
  );
  assert.equal(tooManyTopics.ok, false);
  if (!tooManyTopics.ok) {
    assert.match(tooManyTopics.message, /máximo 20/u);
  }
});

test("profile list capacities allow every API-valid item with separators", () => {
  assert.equal(profileListInputCapacity("languages"), 368);
  assert.equal(profileListInputCapacity("skills"), 1858);
  assert.equal(profileListInputCapacity("interests"), 1858);
  assert.equal(profileListInputCapacity("helpTopics"), 2038);
  assert.equal(profileListInputCapacity("learningTopics"), 2038);
});

test("profile headline accepts empty or 2-140 trimmed characters", () => {
  assert.deepEqual(parseProfileHeadline("   "), { ok: true, value: null });
  assert.deepEqual(parseProfileHeadline(" AB "), { ok: true, value: "AB" });

  const tooShort = parseProfileHeadline("x");
  assert.equal(tooShort.ok, false);
  if (!tooShort.ok) assert.match(tooShort.message, /2 y 140/u);

  const tooLong = parseProfileHeadline("x".repeat(141));
  assert.equal(tooLong.ok, false);
  if (!tooLong.ok) assert.match(tooLong.message, /2 y 140/u);
});

test("revision conflict reloads canonical profile before another update", async () => {
  let meCalls = 0;
  let updateCalls = 0;
  const controller = new MobileProfileController(
    apiStub({
      me: async () => {
        meCalls += 1;
        return meCalls === 1 ? ready([], null, 1) : ready([], null, 4);
      },
      update: async () => {
        updateCalls += 1;
        throw new ApiRequestError(
          "conflict",
          409,
          "PROFILE_REVISION_CONFLICT",
          "conflict",
        );
      },
    }),
  );

  await controller.load("session-a");
  await controller.updateProfile("session-a", {
    expectedRevision: 1,
    bio: "Cambio viejo",
  });

  assert.equal(updateCalls, 1);
  assert.equal(meCalls, 2);
  const snapshot = controller.getSnapshot();
  assert.equal(snapshot.kind, "ready");
  if (snapshot.kind === "ready") {
    assert.equal(snapshot.data.profile.revision, 4);
    assert.equal(snapshot.failure, null);
    assert.match(snapshot.notice ?? "", /versión confirmada por el servidor/u);
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
