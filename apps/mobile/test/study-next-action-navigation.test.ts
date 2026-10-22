import assert from "node:assert/strict";
import test from "node:test";

import {
  studyFocusDestination,
  studyNextActionDestination,
  studyNextActionTaskLabel,
} from "../src/features/study/study-next-action-navigation";

const questionId = "269f2da7-f70c-418d-9151-000000000002";
const resourceId = "269f2da7-f70c-418d-9151-000000000003";

test("next question references open the canonical question detail", () => {
  assert.deepEqual(
    studyNextActionDestination({
      kind: "question",
      id: questionId,
      minutes: 45,
    }),
    {
      pathname: "/questions/[questionId]",
      params: { questionId },
    },
  );
  assert.equal(
    studyNextActionTaskLabel({ kind: "question", id: questionId, minutes: 45 }),
    "Pregunta",
  );
});

test("next resource references open the canonical resource detail", () => {
  assert.deepEqual(
    studyNextActionDestination({
      kind: "resource",
      id: resourceId,
      minutes: 30,
    }),
    { pathname: "/resources/[id]", params: { id: resourceId } },
  );
  assert.equal(
    studyNextActionTaskLabel({ kind: "resource", id: resourceId, minutes: 30 }),
    "Apunte",
  );
});

test("malformed task references never become navigable", () => {
  assert.equal(
    studyNextActionDestination({
      kind: "question",
      id: "invalid",
      minutes: 45,
    }),
    null,
  );
});

test("task focus suggestions use a bounded explicit timer route", () => {
  assert.deepEqual(studyFocusDestination(45), {
    pathname: "/study-focus",
    params: { minutes: "45" },
  });
  assert.equal(studyFocusDestination(0), null);
  assert.equal(studyFocusDestination(46), null);
  assert.equal(studyFocusDestination(125), null);
});
