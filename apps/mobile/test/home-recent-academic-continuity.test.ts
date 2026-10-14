import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import type {
  AcademicCurrentContext,
  AcademicSubjectParticipation,
  ResourceView,
} from "@losapuntes/contracts";

import {
  groupHomeRecentlyOpened,
  homeSelectedCurrentSubject,
  prioritizeHomeRecentlyOpened,
} from "../src/features/home/home-recent-academic-continuity";
import { HomeRecentOpenedController } from "../src/features/home/home-recent-opened-controller";
import { SessionRecentResourceOpens } from "../src/features/resources/recent-opened-memory";
import { savedSubjectQuestionsAction } from "../src/features/resources/saved-subject-questions-action";
import type { ResourceConsumptionApi } from "../src/features/resources/resource-consumption-api";

const currentSubjectId = "11111111-1111-4111-8111-111111111111";
const otherSubjectId = "22222222-2222-4222-8222-222222222222";
const currentParticipationId = "33333333-3333-4333-8333-333333333333";

function participation(
  id: string,
  subjectId: string,
  state: AcademicSubjectParticipation["state"] = "current",
): AcademicSubjectParticipation {
  return {
    id,
    subjectId,
    subjectName: " Análisis Matemático ",
    state,
    createdAt: "2026-10-14T12:00:00.000Z",
    updatedAt: "2026-10-14T12:00:00.000Z",
  };
}
function context(subjectParticipationId?: string): AcademicCurrentContext {
  return {
    affiliationId: "44444444-4444-4444-8444-444444444444",
    ...(subjectParticipationId ? { subjectParticipationId } : {}),
    revision: 4,
    updatedAt: "2026-10-14T12:00:00.000Z",
  };
}
function resource(id: string, subjectId: string): ResourceView {
  return {
    id,
    title: `Apunte ${id}`,
    description: null,
    tags: [],
    visibility: "public",
    author: null,
    academic: {
      subject: {
        id: subjectId,
        name: subjectId === currentSubjectId ? "Análisis Matemático" : "Física",
      },
      courseOffering: null,
    },
    file: {
      id,
      filename: `${id}.pdf`,
      mimeType: "application/pdf",
      byteSize: 1024,
    },
    capabilities: { edit: false, manageShares: false },
    revision: 1,
    createdAt: "2026-10-14T12:00:00.000Z",
    updatedAt: "2026-10-14T12:00:00.000Z",
  };
}

test("context resolves participation ID to canonical Subject, never treats it as Subject ID", () => {
  const selected = homeSelectedCurrentSubject(context(currentParticipationId), [
    participation("55555555-5555-4555-8555-555555555555", otherSubjectId),
    participation(currentParticipationId, currentSubjectId),
  ]);
  assert.deepEqual(selected, {
    subjectId: currentSubjectId,
    name: "Análisis Matemático",
  });
  assert.notEqual(selected?.subjectId, currentParticipationId);
});

test("no context, unknown participation, planned participation and invalid Subject fail closed", () => {
  const current = participation(currentParticipationId, currentSubjectId);
  assert.equal(homeSelectedCurrentSubject(null, [current]), null);
  assert.equal(homeSelectedCurrentSubject(context(), [current]), null);
  assert.equal(
    homeSelectedCurrentSubject(
      context("66666666-6666-4666-8666-666666666666"),
      [current],
    ),
    null,
  );
  assert.equal(
    homeSelectedCurrentSubject(context(currentParticipationId), [
      participation(currentParticipationId, currentSubjectId, "planned"),
    ]),
    null,
  );
  assert.equal(
    homeSelectedCurrentSubject(context(currentParticipationId), [
      participation(currentParticipationId, "../other"),
    ]),
    null,
  );
});

test("recent current Subject appears first, keeping stable MRU order within each group", () => {
  const items = [
    resource("other-1", otherSubjectId),
    resource("other-2", otherSubjectId),
    resource("current-1", currentSubjectId),
    resource("other-3", otherSubjectId),
    resource("current-2", currentSubjectId),
    resource("other-4", otherSubjectId),
  ];
  const groups = groupHomeRecentlyOpened(items, currentSubjectId);
  assert.deepEqual(
    groups.current.map((x) => x.id),
    ["current-1", "current-2"],
  );
  assert.deepEqual(
    groups.other.map((x) => x.id),
    ["other-1", "other-2", "other-3", "other-4"],
  );
  assert.deepEqual(
    prioritizeHomeRecentlyOpened(items, currentSubjectId, 4).map((x) => x.id),
    ["current-1", "current-2", "other-1", "other-2"],
  );
  assert.deepEqual(
    prioritizeHomeRecentlyOpened(items, null, 4).map((x) => x.id),
    ["other-1", "other-2", "current-1", "other-3"],
  );
});

test("subject preference is not a filter on authorized history; other recent resources remain accessible", () => {
  const items = [
    resource("other-1", otherSubjectId),
    resource("other-2", otherSubjectId),
  ];
  assert.deepEqual(
    prioritizeHomeRecentlyOpened(items, currentSubjectId, 4).map((x) => x.id),
    ["other-1", "other-2"],
  );
  assert.equal(
    groupHomeRecentlyOpened(items, currentSubjectId).current.length,
    0,
  );
  assert.equal(
    prioritizeHomeRecentlyOpened(items, currentSubjectId, 0).length,
    0,
  );
});

test("controller checks all eight IDs and can surface matching recent resource beyond first four", async () => {
  const memory = new SessionRecentResourceOpens();
  // Most recent four are not in the selected Subject; relevant resource is fifth.
  for (const [id, subject] of [
    ["current-old", currentSubjectId],
    ["other-4", otherSubjectId],
    ["other-3", otherSubjectId],
    ["other-2", otherSubjectId],
    ["other-1", otherSubjectId],
  ] as const)
    memory.record("user:session", id);

  const lookedUp: string[] = [];
  const api = {
    resource: async (id: string): Promise<{ resource: ResourceView }> => {
      lookedUp.push(id);
      return {
        resource: resource(
          id,
          id === "current-old" ? currentSubjectId : otherSubjectId,
        ),
      };
    },
  } as Pick<ResourceConsumptionApi, "resource">;
  const controller = new HomeRecentOpenedController(api, memory);
  await controller.load("home:context-a", "user:session", currentSubjectId);
  const first = controller.getSnapshot();
  assert.equal(first.kind, "ready");
  if (first.kind !== "ready") return;
  assert.deepEqual(
    first.items.map((x) => x.id),
    ["current-old", "other-1", "other-2", "other-3"],
  );
  assert.equal(first.moreAvailable, true);
  assert.equal(lookedUp.length, 5);

  await controller.load("home:context-b", "user:session", otherSubjectId);
  const switched = controller.getSnapshot();
  assert.equal(switched.kind, "ready");
  if (switched.kind === "ready") {
    assert.deepEqual(
      switched.items.map((x) => x.id),
      ["other-1", "other-2", "other-3", "other-4"],
    );
  }
  assert.deepEqual(memory.read("user:session"), [
    "other-1",
    "other-2",
    "other-3",
    "other-4",
    "current-old",
  ]);
});

test("questions navigation reuses validated Subject UUID and has no implicit publish grant", () => {
  const action = savedSubjectQuestionsAction(
    resource("current", currentSubjectId),
  );
  assert.deepEqual(action?.href, {
    pathname: "/questions/subjects/[subjectId]",
    params: { subjectId: currentSubjectId },
  });
  assert.match(action?.accessibilityHint ?? "", /servidor vuelve a validar/u);
  assert.equal(
    savedSubjectQuestionsAction(resource("invalid", "bad-id")),
    null,
  );
});

test("Home wiring derives current selected participation only from session-authorized academic data", () => {
  const home = readFileSync(
    new URL("../src/features/home/home-screen.tsx", import.meta.url),
    "utf8",
  );
  const card = readFileSync(
    new URL(
      "../src/features/home/home-recent-opened-card.tsx",
      import.meta.url,
    ),
    "utf8",
  );
  assert.match(home, /academicBelongsToSession/u);
  assert.match(
    home,
    /homeSelectedCurrentSubject\(expectedContext, academicData\.participations\)/u,
  );
  assert.match(home, /currentSubject=\{selectedRecentSubject\}/u);
  assert.match(
    card,
    /controller\.load\(authorityKey, sessionAuthorityKey, preferredSubjectId\)/u,
  );
  assert.match(card, /recentScope === "current"/u);
  assert.match(card, /Preguntas de mi materia/u);
  assert.match(card, /savedSubjectQuestionsAction\(resource\)/u);
  assert.match(card, /controller\.clear\(authorityKey, sessionAuthorityKey\)/u);
});
