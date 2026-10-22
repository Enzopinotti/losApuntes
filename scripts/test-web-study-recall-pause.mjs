import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  RECALL_CHECKPOINT_TTL_MS,
  RECALL_CHECKPOINT_MAX_SCOPES,
  pauseRecallRound,
  inspectRecallPause,
  takeRecallPause,
  forgetRecallPause,
} from "../apps/web/src/features/study/study-recall-pause.mjs";

const subject = "11111111-1111-4111-8111-111111111111";
const anotherSubject = "33333333-3333-4333-8333-333333333333";
const q1 = "a2222222-2222-4222-8222-222222222222";
const q2 = "b3333333-3333-4333-8333-333333333333";
const scope = `authenticated:owner1:session1:${subject}:none`;
const anotherAccount = `authenticated:owner2:session2:${subject}:none`;
const anotherFocus = `authenticated:owner1:session1:${subject}:focus-other`;
const now = 1_000_000;
const input = {
  ids: [q1, q2],
  position: 1,
  pass: 2,
  outcomes: { [q1]: "review", [q2]: "understood" },
  history: [
    { pass: 1, total: 2, understood: 1, review: 1, pending: 0 },
  ],
  startsAt: "2026-10-21T19:30",
  minutes: 30,
};
assert.equal(RECALL_CHECKPOINT_TTL_MS, 600000);
assert.equal(RECALL_CHECKPOINT_MAX_SCOPES, 5);
assert.equal(pauseRecallRound(scope, subject, input, now), true);
const inspected = inspectRecallPause(scope, subject, now + 1);
assert.ok(inspected);
assert.equal(inspected.expiresAt, now + RECALL_CHECKPOINT_TTL_MS);
assert.deepEqual(inspected.checkpoint, input);
assert.equal(inspectRecallPause(scope, subject, now + 2).checkpoint.pass, 2);
assert.equal(inspectRecallPause(anotherAccount, subject, now + 3), null);
assert.equal(inspectRecallPause(anotherFocus, subject, now + 3), null);
assert.equal(inspectRecallPause(scope, anotherSubject, now + 3), null);
assert.equal(takeRecallPause(anotherAccount, subject, now + 3), null);
assert.equal(forgetRecallPause(scope, anotherSubject, now + 3), false);

// Snapshots are independent. The input, caller-side mutation, and inspection
// must not mutate the in-module checkpoint.
input.ids[0] = anotherSubject;
input.outcomes[q1] = "understood";
inspected.checkpoint.ids[1] = anotherSubject;
inspected.checkpoint.history[0].total = 10;
const resumed = takeRecallPause(scope, subject, now + 4);
assert.ok(resumed);
assert.deepEqual(resumed.ids, [q1, q2]);
assert.deepEqual(resumed.outcomes, { [q1]: "review", [q2]: "understood" });
assert.deepEqual(resumed.history, [
  { pass: 1, total: 2, understood: 1, review: 1, pending: 0 },
]);
assert.equal(inspectRecallPause(scope, subject, now + 5), null);
assert.equal(takeRecallPause(scope, subject, now + 5), null);

// Expiry is exact and cannot be renewed by inspecting, reading, or an invalid
// foreign scope. Hard refresh drops all entries because this is a JS Map.
const clean = { ...resumed, ids: [q1, q2] };
assert.equal(pauseRecallRound(scope, subject, clean, now + 10), true);
assert.ok(inspectRecallPause(scope, subject, now + 10 + RECALL_CHECKPOINT_TTL_MS - 1));
assert.equal(takeRecallPause(scope, subject, now + 10 + RECALL_CHECKPOINT_TTL_MS), null);
assert.equal(inspectRecallPause(scope, subject, now + 10 + RECALL_CHECKPOINT_TTL_MS), null);

// Explicit discard is scoped and cannot affect an unrelated session.
assert.equal(pauseRecallRound(scope, subject, clean, now + 700000), true);
assert.equal(forgetRecallPause(anotherAccount, subject, now + 700001), false);
assert.ok(inspectRecallPause(scope, subject, now + 700001));
assert.equal(forgetRecallPause(scope, subject, now + 700002), true);
assert.equal(forgetRecallPause(scope, subject, now + 700003), false);

// Fail closed before writing any malformed checkpoint. Nothing arbitrary,
// including question content, titles, answers or author names, may be stored.
const invalidCases = [
  { ...clean, reflections: { [q1]: "mi respuesta privada" } },
  { ...clean, revealedIds: [q1] },
  { ...clean, title: "pregunta privada" },
  { ...clean, position: -1 },
  { ...clean, position: 2 },
  { ...clean, pass: 0 },
  { ...clean, pass: 10001 },
  { ...clean, outcomes: { [q1]: "perfect" } },
  { ...clean, outcomes: { [anotherSubject]: "review" } },
  { ...clean, history: [{ pass: 2, total: 1, understood: 1, review: 0, pending: 0 }] },
  { ...clean, history: [{ pass: 1, total: 2, understood: 2, review: 2, pending: 0 }] },
  { ...clean, history: [{ pass: 1, total: 1, understood: 1, review: 0, pending: 0, body: "secret" }] },
  { ...clean, startsAt: "2026-10-21" },
  { ...clean, minutes: 21 },
  { ...clean, ids: [q1, q1] },
  { ...clean, ids: [] },
  null,
];
for (const candidate of invalidCases) {
  assert.throws(() => pauseRecallRound(scope, subject, candidate, now + 710000));
  assert.equal(inspectRecallPause(scope, subject, now + 710000), null);
}
for (const candidateScope of [
  "", "anonymous:owner1:session1:subject", "authenticated:",
  "authenticated:".padEnd(513, "x"),
]) {
  assert.throws(() => pauseRecallRound(candidateScope, subject, clean, now + 720000),
    /RECALL_CHECKPOINT_INVALID/u);
}
assert.throws(() => pauseRecallRound(scope, subject, clean, -1),
  /RECALL_CHECKPOINT_INVALID/u);
assert.equal(inspectRecallPause(scope, subject, NaN), null);

const scopes = Array.from({ length: 6 }, (_, i) =>
  `authenticated:owner${i}:session${i}:${subject}:none`);
for (const oneScope of scopes) {
  assert.equal(pauseRecallRound(oneScope, subject, clean, now + 800000), true);
}
assert.equal(inspectRecallPause(scopes[0], subject, now + 800001), null);
for (const oneScope of scopes.slice(1)) {
  assert.ok(takeRecallPause(oneScope, subject, now + 800002));
}

// Integration contract: no auto-resume, no user content is checkpointed, and
// activation epoch invalidates cached detail for the same question/pass.
const page = readFileSync(
  new URL("../apps/web/src/pages/StudyPractice.tsx", import.meta.url), "utf8",
);
const declarations = readFileSync(
  new URL("../apps/web/src/features/study/study-recall-pause.d.mts", import.meta.url), "utf8",
);
assert.match(declarations, /export declare function takeRecallPause\(/u);
assert.match(page, /pauseRecallRound\(scope, subjectId, \{/u);
assert.match(page, /takeRecallPause\(scope, subjectId\)/u);
assert.match(page, /forgetRecallPause\(scope, subjectId\)/u);
assert.match(page, /inspectRecallPause\(scope, subjectId\)/u);
assert.match(page, /setActivationId\(\(value\) => value \+ 1\)/u);
assert.match(page, /activation-\$\{activationId\}/u);
assert.match(page, /revealedIds: \[\],\s*reflections: \{\}/u);
assert.match(page, /status === "authenticated"/u);
assert.match(page, /Continuar ronda pausada/u);
assert.match(page, /Pausar ronda/u);
assert.match(page, /Descartar pausa/u);
assert.match(page, /communityApi\.question\(currentId, ticket\.signal\)/u);
assert.match(page, /response\.question\.academic\.subject\.id !== subjectId/u);
assert.doesNotMatch(page, /localStorage|sessionStorage|IndexedDB/iu);
console.log("B136 private, bounded, one-time pause/resume contract PASS");
