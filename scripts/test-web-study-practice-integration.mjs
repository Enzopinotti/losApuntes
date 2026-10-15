import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

function read(relativePath) {
  return readFileSync(new URL(`../${relativePath}`, import.meta.url), "utf8");
}

const routes = read("apps/web/src/app/routes.tsx");
const practice = read("apps/web/src/pages/StudyPractice.tsx");
const model = read("apps/web/src/features/study/study-active-recall.mjs");
const session = read("apps/web/src/pages/StudySession.tsx");
const workbench = read("apps/web/src/pages/StudyWorkbench.tsx");

assert.match(routes, /path: "study\/practice"[\s\S]*?<PrivateRoute>/u);
assert.match(workbench, /Practicar preguntas/u);
assert.match(session, /study\/practice\?subjectId/u);
assert.match(practice, /subjectLimit: 8, resourcesPerSubject: 1/u);
assert.match(practice, /studySubjectSelectionFromParams\(params\)/u);
assert.match(practice, /resolveStudySubject\(selection, context\.data\.subjects\)/u);
assert.match(practice, /communityApi\.questions\(/u);
assert.match(practice, /communityApi\.question\(currentId, ticket\.signal\)/u);
assert.match(practice, /response\.question\.academic\.subject\.id !== subjectId/u);
assert.match(practice, /communityApi\.answers\(/u);
assert.match(practice, /detailState\?\.key === detailKey/u);
assert.match(practice, /roundState\?\.scope === scope/u);
assert.match(practice, /selectionState\?\.scope === scope/u);
assert.match(practice, /beginDetail/u);
assert.match(practice, /detailCurrent\(ticket\)/u);
assert.match(practice, /finishDetail\(ticket\)/u);
assert.match(practice, /!revealed \?/u);
assert.match(practice, /const shownAnswers = revealed \?/u);
assert.match(practice, /const revealAnswers = async/u);
assert.match(practice, /practice-reveal/u);
assert.match(practice, /revealCurrent\(ticket\)/u);
assert.match(practice, /Las respuestas siguen ocultas/u);
assert.match(practice, /aria-pressed=/u);
assert.match(practice, /const acceptedNotLoaded/u);
assert.match(practice, /maxLength=\{1000\}/u);
assert.match(practice, /nextRecallOutcomes\(/u);
assert.match(practice, /recallToStudySession\(/u);
assert.match(practice, /serializeStudySession\(/u);
assert.match(practice, /URL\.revokeObjectURL/u);
assert.match(practice, /window\.confirm\(/u);
assert.doesNotMatch(practice, /localStorage|sessionStorage|IndexedDB/iu);
assert.doesNotMatch(practice, /setInterval\(|autoPlay|streak/iu);
assert.doesNotMatch(model, /answer\.body|author\.displayName|signedUrl/u);
console.log("Study practice Web integration contract: PASS");
