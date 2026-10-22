import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";

import {
  isPracticeQuestionForSubject,
  practiceQuestionFromParams,
  practiceQuestionHref,
} from "../apps/web/src/features/study/study-practice-question-link.mjs";

const root = process.cwd();
const source = (filename) => readFile(path.join(root, filename), "utf8");
const subject = "b2d9085e-4fa2-4f12-8b31-2acf4219d876";
const question = "ad182ec1-8f27-4aaa-92c0-3ec889776a28";
const subjectUpper = subject.toUpperCase();
const questionUpper = question.toUpperCase();

const href = practiceQuestionHref(subjectUpper, questionUpper);
assert.equal(
  href,
  "/study/practice?subjectId=" + subject + "&questionId=" + question,
);
const params = new URLSearchParams(href.split("?")[1]);
assert.deepEqual(practiceQuestionFromParams(params), {
  kind: "selected",
  questionId: question,
});
assert.deepEqual(practiceQuestionFromParams(new URLSearchParams()), {
  kind: "none",
});
for (const query of [
  "questionId=",
  "questionId=not-a-uuid",
  "questionId=" + question + "&questionId=" + question,
  "questionId=../../secrets",
]) {
  assert.deepEqual(
    practiceQuestionFromParams(new URLSearchParams(query)),
    { kind: "invalid" },
    "Malformed or repeated external focus must fail closed",
  );
}
assert.equal(practiceQuestionHref(subject, "nope"), null);
assert.equal(practiceQuestionHref("nope", question), null);
assert.equal(practiceQuestionHref(subject, "https://evil.example"), null);

const fixture = {
  id: question,
  academic: { subject: { id: subject, name: "Álgebra" } },
};
assert.equal(isPracticeQuestionForSubject(fixture, subject, question), true);
assert.equal(
  isPracticeQuestionForSubject(fixture, "c2d9085e-4fa2-4f12-8b31-2acf4219d876", question),
  false,
);
assert.equal(
  isPracticeQuestionForSubject(
    { ...fixture, id: "bb182ec1-8f27-4aaa-92c0-3ec889776a28" },
    subject,
    question,
  ),
  false,
);
assert.equal(isPracticeQuestionForSubject(null, subject, question), false);
assert.equal(
  isPracticeQuestionForSubject(
    { ...fixture, academic: { subject: null } },
    subject,
    question,
  ),
  false,
);

const workbench = await source("apps/web/src/pages/StudyWorkbench.tsx");
assert.match(workbench, /practiceQuestionHref\(selectedSubject\.id, item\.id\)/u);
assert.match(workbench, /Practicar esta pregunta/u);

const practice = await source("apps/web/src/pages/StudyPractice.tsx");
assert.match(practice, /practiceQuestionFromParams\(params\)/u);
assert.match(practice, /questionSelection\.kind === "invalid"/u);
assert.match(practice, /status !== "authenticated" \|\| !subjectId \|\| !focusId/u);
assert.match(practice, /communityApi\.question\(focusId, ticket\.signal\)/u);
assert.match(practice, /isPracticeQuestionForSubject\(response\.question, subjectId, focusId\)/u);
assert.match(practice, /useAsyncAuthorityFence\(`practice-focus:\$\{focusedKey\}`\)/u);
assert.match(practice, /focusedState\?\.key === focusedKey/u);
assert.match(practice, /if \(!focusedCurrent\(ticket\)\) return/u);
assert.match(practice, /Empezar práctica enfocada/u);
assert.match(practice, /startRound\(\[focused\.question!\.id\]\)/u);
assert.match(practice, /No\s+abrimos otra pregunta ni iniciamos una práctica general/u);
assert.match(practice, /Las respuestas se mantienen ocultas/u);
assert.match(practice, /response\.question\.academic\.subject\.id !== subjectId/u);
assert.doesNotMatch(practice, /localStorage|sessionStorage/u);

const scopeMatch = practice.match(/const scope = `([^\n]+)`;/u)?.[1];
assert.ok(scopeMatch?.includes("focusId"), "Focus change must invalidate prior round");

console.log("PASS focused question practice links, access and answer privacy");
