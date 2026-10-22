import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import {
  updateReviewMarks,
  summarizeReviews,
  reviewCandidates,
  buildReviewSession,
} from "../apps/web/src/features/study/study-review-queue.mjs";
import {
  emptyStudySession,
  readStudySession,
  serializeStudySession,
} from "../apps/web/src/features/study/study-session-plan.mjs";
import {
  createStudyHandoff,
  inspectStudyHandoff,
  finishStudyHandoff,
} from "../apps/web/src/features/study/study-session-handoff.mjs";

const subject = "ad96732b-2042-4fd5-83f1-32f8e724a35d";
const ids = [
  "ad119ad9-af1b-4c2b-8f37-4ef186ba3101",
  "ad119ad9-af1b-4c2b-8f37-4ef186ba3102",
  "ad119ad9-af1b-4c2b-8f37-4ef186ba3103",
  "ad119ad9-af1b-4c2b-8f37-4ef186ba3104",
  "ad119ad9-af1b-4c2b-8f37-4ef186ba3105",
];
const kinds = ["question", "resource", "question", "resource", "question"];
const tasks = ids.map((id, index) => ({
  id, kind: kinds[index], done: index === 1 || index === 2 || index === 4,
  minutes: 15 + index * 5,
}));
const plan = {
  ...emptyStudySession(subject),
  title: "Mi estudio antes del examen",
  notes: "Anotación privada que no debe pasar al nuevo plan.",
  startsAt: null,
  tasks,
};
const key = (index) => tasks[index].kind + ":" + tasks[index].id;
let ratings = {};
let scenarios = 0;
function verify(label, fn) {
  fn();
  scenarios += 1;
  process.stdout.write("PASS " + label + "\n");
}

verify("baseline includes every unrated pending task only", () => {
  const found = reviewCandidates(plan, {});
  assert.deepEqual(found.map((task) => task.id), [ids[0], ids[3]]);
  assert.ok(found.every((task) => task.category === "pending"));
});
verify("mark review, reinforce and mastery", () => {
  ratings = updateReviewMarks(plan, ratings, tasks[2].kind, tasks[2].id, "repeat");
  ratings = updateReviewMarks(plan, ratings, tasks[1].kind, tasks[1].id, "reinforce");
  ratings = updateReviewMarks(plan, ratings, tasks[3].kind, tasks[3].id, "confident");
  assert.equal(ratings[key(2)], "repeat");
  assert.equal(ratings[key(1)], "reinforce");
  assert.equal(ratings[key(3)], "confident");
});
verify("explicit repeat gets priority and mastery is excluded", () => {
  assert.deepEqual(reviewCandidates(plan, ratings).map((item) => item.id),
    [ids[2], ids[0], ids[1]]);
  assert.equal(reviewCandidates(plan, ratings).some((item) => item.id === ids[3]), false);
});
verify("all modes remain deterministic", () => {
  assert.deepEqual(
    reviewCandidates(plan, ratings, "priority").map((item) => item.id), [ids[2], ids[0]],
  );
  assert.deepEqual(
    reviewCandidates(plan, ratings, "reinforce").map((item) => item.id), [ids[1]],
  );
  assert.throws(() => reviewCandidates(plan, ratings, "everything"), /STUDY_REVIEW_MODE_INVALID/);
});
verify("ratings distinguish unfinished from completed", () => {
  assert.deepEqual(summarizeReviews(plan, ratings), {
    repeat: 1, reinforce: 1, confident: 1,
    pendingUnrated: 1, completedUnrated: 1, eligible: 3,
  });
});
verify("erasing a rating restores automatic unfinished choice", () => {
  const changed = updateReviewMarks(plan, ratings, tasks[3].kind, tasks[3].id, null);
  assert.equal(changed[key(3)], undefined);
  assert.deepEqual(reviewCandidates(plan, changed).map((item) => item.id),
    [ids[2], ids[0], ids[3], ids[1]]);
  assert.equal(ratings[key(3)], "confident");
});
verify("original plan and marks remain unchanged", () => {
  const next = updateReviewMarks(plan, ratings, tasks[0].kind, tasks[0].id, "repeat");
  assert.equal(next[key(0)], "repeat");
  assert.equal(ratings[key(0)], undefined);
  assert.equal(plan.tasks[0].done, false);
});
verify("reject unknown rating, key and stale/cross-subject marks", () => {
  assert.throws(() => updateReviewMarks(plan, ratings, "question", ids[1], "repeat"),
    /STUDY_REVIEW_RATING_INVALID/);
  assert.throws(() => updateReviewMarks(plan, ratings, "question", ids[0], "unknown"),
    /STUDY_REVIEW_RATING_INVALID/);
  assert.throws(() => summarizeReviews(plan, { ...ratings, "question:foreign": "repeat" }),
    /STUDY_REVIEW_MARKS_INVALID/);
  assert.throws(() => summarizeReviews(plan, { [key(0)]: "wrong" }),
    /STUDY_REVIEW_MARKS_INVALID/);
});
verify("reject malformed ratings containers", () => {
  for (const invalid of [null, [], "none", new Date()]) {
    assert.throws(() => summarizeReviews(plan, invalid), /STUDY_REVIEW_MARKS_INVALID/);
  }
});
verify("generated review keeps only v1 ids, duration and pending status", () => {
  const next = buildReviewSession(plan, ratings, "all");
  assert.ok(next);
  assert.equal(next.subjectId, subject);
  assert.equal(next.title, "Repaso: " + plan.title);
  assert.equal(next.notes, "");
  assert.equal(next.startsAt, null);
  assert.deepEqual(next.tasks.map((task) => task.id), [ids[2], ids[0], ids[1]]);
  assert.ok(next.tasks.every((task) => task.done === false));
  assert.deepEqual(next.tasks.map((task) => task.minutes), [25, 15, 20]);
  const json = serializeStudySession(next);
  assert.deepEqual(readStudySession(json), next);
  assert.doesNotMatch(json, /rating|repeat|reinforce|confident|Anotación|respuesta|token/u);
});
verify("authorized subset excludes revoked references, never broadens results", () => {
  const next = buildReviewSession(plan, ratings, "all", [key(0), key(1)]);
  assert.deepEqual(next.tasks.map((task) => task.id), [ids[0], ids[1]]);
  assert.equal(buildReviewSession(plan, ratings, "all", []), null);
  assert.equal(buildReviewSession(plan, ratings, "reinforce", [key(1)]).tasks.length, 1);
});
verify("reject unknown, duplicate or surplus authorization keys", () => {
  for (const keys of [[key(0), key(0)], ["resource:unknown"], ["question:" + ids[3]]]) {
    assert.throws(() => buildReviewSession(plan, ratings, "all", keys),
      /STUDY_REVIEW_ALLOWED_INVALID/);
  }
  assert.throws(() => buildReviewSession(plan, ratings, "all", new Set([key(0)])),
    /STUDY_REVIEW_ALLOWED_INVALID/);
});
verify("all clear means no new review plan", () => {
  const allClear = tasks.reduce((out, task) =>
    updateReviewMarks(plan, out, task.kind, task.id, "confident"), {});
  assert.equal(buildReviewSession(plan, allClear), null);
});
verify("long title remains valid and under v1 100-character limit", () => {
  const lengthened = { ...plan, title: "t".repeat(100) };
  const result = buildReviewSession(lengthened, ratings);
  assert.equal(result.title.length, 100);
});
verify("existing one-time scoped handoff accepts generated review", () => {
  const next = buildReviewSession(plan, ratings);
  const scope = "authenticated:user-7:session-8:" + subject;
  const token = createStudyHandoff(next, scope, 1000);
  assert.deepEqual(inspectStudyHandoff(token, scope, subject, 1001), next);
  assert.equal(inspectStudyHandoff(token, "authenticated:other:session:" + subject, subject, 1001), null);
  assert.equal(finishStudyHandoff(token, scope), true);
  assert.equal(inspectStudyHandoff(token, scope, subject, 1002), null);
});

const root = process.cwd();
const runner = await readFile(path.join(root, "apps/web/src/pages/StudyRunner.tsx"), "utf8");
const styles = await readFile(path.join(root, "apps/web/src/pages/StudyRunner.scss"), "utf8");
verify("runner adds independent self-reports without affecting done", () => {
  assert.match(runner, /updateReviewMarks\(\s*previous\.plan, previous\.reviews/u);
  assert.match(runner, /Necesito repasar/u);
  assert.match(runner, /Quiero reforzar/u);
  assert.match(runner, /Lo tengo claro/u);
  assert.match(runner, /aria-pressed/u);
});
verify("new plan checks live server access at execution boundary", () => {
  assert.match(runner, /verifiedTaskLabel\(runner\.plan, candidate, ticket\.signal\)/u);
  assert.match(runner, /if \(!reviewCurrent\(ticket\)\) return;/u);
  assert.match(runner, /buildReviewSession\(\s*runner\.plan, runner\.reviews, reviewMode, permitted/u);
  assert.match(runner, /omitted > 0 && !window\.confirm/u);
  assert.match(runner, /Ninguna actividad seleccionada conserva acceso confirmado/u);
});
verify("recheck preserves ratings only on accessible, same-scoped activities", () => {
  assert.match(runner, /if \(!resetClocks && previous\?\.scope === scope\)/u);
  assert.match(runner, /if \(rating && labels\[key\] !== null\) reviews\[key\] = rating;/u);
});
verify("planner handoff uses opaque one-time nonce", () => {
  assert.match(runner, /createStudyHandoff\(next, scope\)/u);
  assert.match(runner, /state: handoff/u);
  assert.match(runner, /los-apuntes-proximo-repaso\.json/u);
});
verify("review UI is accessible and remains responsive", () => {
  assert.match(runner, /fieldset className="study-runner-ratings"/u);
  assert.match(runner, /aria-labelledby="study-run-review"/u);
  assert.match(styles, /\.study-runner-review-preview/u);
  assert.match(styles, /grid-column: 1 \/ -1/u);
});
verify("no rating persistence, secrets or extra backend endpoints", () => {
  assert.doesNotMatch(runner, /localStorage|sessionStorage|indexedDB/u);
  assert.doesNotMatch(runner, /fetch\("/u);
});
process.stdout.write("PASS " + scenarios + " B60 model, authority and UI contracts\n");
