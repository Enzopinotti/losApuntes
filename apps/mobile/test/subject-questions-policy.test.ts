import assert from "node:assert/strict";
import test from "node:test";

import {
  canComposeForSubject,
  subjectQuestionsRouteId,
} from "../src/features/community/subject-questions-policy";

const subjectA = "11111111-1111-4111-8111-111111111111";
const subjectB = "22222222-2222-4222-8222-222222222222";

test("only canonical UUIDv4 subject IDs are accepted from the route", () => {
  assert.equal(subjectQuestionsRouteId(subjectA), subjectA);
  assert.equal(subjectQuestionsRouteId(subjectA.toUpperCase()), subjectA);
  for (const value of [
    undefined,
    "",
    ["valid", "extra"],
    "not-a-subject",
    "../questions",
    "11111111-1111-1111-1111-111111111111",
    "11111111-1111-4111-1111-111111111111",
    "a".repeat(500),
  ]) {
    assert.equal(subjectQuestionsRouteId(value), null);
  }
});

test("the route does not authorize question creation without matching participation", () => {
  assert.equal(
    canComposeForSubject(subjectA, "ready", { kind: "subject", subjectId: subjectA }),
    true,
  );
  assert.equal(
    canComposeForSubject(subjectA, "ready", { kind: "subject", subjectId: subjectB }),
    false,
  );
  assert.equal(canComposeForSubject(subjectA, "ready", { kind: "all" }), false);
  assert.equal(
    canComposeForSubject(subjectA, "revalidating", {
      kind: "subject",
      subjectId: subjectA,
    }),
    false,
  );
  assert.equal(canComposeForSubject(null, "ready", {
    kind: "subject",
    subjectId: subjectA,
  }), false);
});
