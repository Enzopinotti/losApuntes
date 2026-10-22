import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (p) => readFileSync(new URL("../" + p, import.meta.url), "utf8");
const helper = read("apps/web/src/features/study/study-practice-question-link.mjs");
const declarations = read("apps/web/src/features/study/study-practice-question-link.d.mts");
const practice = read("apps/web/src/pages/StudyPractice.tsx");
const workbench = read("apps/web/src/pages/StudyWorkbench.tsx");
const scss = read("apps/web/src/pages/StudyPractice.scss");
const routes = read("apps/web/src/app/routes.tsx");
const oldTest = read("scripts/test-web-study-practice-integration.mjs");
const focusTest = read("scripts/test-web-focused-practice-contract.mjs");
const exportSpec = read("apps/api/src/data-lifecycle/domain/account-export.service.spec.ts");
const versioning = read("apps/api/src/data-lifecycle/domain/account-export.service.ts");
const collectionService = read("apps/web/src/features/study-collections/studyCollectionsService.ts");
const backend = read("apps/api/src/study-collections/domain/study-collection.service.ts");
const env = read("apps/api/src/config/runtime-environment.ts");

assert.match(helper, /function practiceQuestionFromParams\(/u);
assert.match(helper, /values\.length !== 1 \|\| !UUID_V4\.test\(values\[0\]\)/u);
assert.match(helper, /questionId: values\[0\]\.toLowerCase\(\)/u);
assert.match(helper, /function practiceQuestionHref\(/u);
assert.match(helper, /new URLSearchParams\(/u);
assert.match(helper, /function isPracticeQuestionForSubject\(/u);
assert.match(helper, /question\?\.academic\?\.subject\?\.id === subjectId\.toLowerCase\(\)/u);
assert.match(declarations, /QuestionView/u);
assert.match(declarations, /PracticeQuestionSelection/u);
assert.match(routes, /path: "study\/practice"[\s\S]*?<PrivateRoute>/u);

assert.match(workbench, /practiceQuestionHref\(selectedSubject\.id, item\.id\)/u);
assert.match(workbench, /Practicar esta pregunta/u);
assert.match(practice, /practiceQuestionFromParams\(params\)/u);
assert.match(practice, /focusId \?\? questionSelection\.kind/u);
assert.match(practice, /focusedState\?\.key === focusedKey/u);
assert.match(practice, /useAsyncAuthorityFence\(`practice-focus:\$\{focusedKey\}`\)/u);
assert.match(practice, /status !== "authenticated" \|\| !subjectId \|\| !focusId/u);
assert.match(practice, /communityApi\.question\(focusId, ticket\.signal\)/u);
assert.match(practice, /if \(!focusedCurrent\(ticket\)\) return;/u);
assert.match(practice, /isPracticeQuestionForSubject\(response\.question, subjectId, focusId\)/u);
assert.match(practice, /questionSelection\.kind === "invalid"/u);
assert.match(practice, /No abrimos otra pregunta ni iniciamos una práctica general/u);
assert.match(practice, /Las respuestas se mantienen ocultas/u);
assert.match(practice, /Empezar práctica enfocada/u);
assert.match(practice, /startRound\(\[focused\.question!\.id\]\)/u);
assert.match(practice, /const revealAnswers = async/u);
assert.match(practice, /response\.question\.academic\.subject\.id !== subjectId/u);
assert.match(practice, /const shownAnswers = revealed \?/u);
assert.match(practice, /Quitar foco y elegir preguntas/u);
assert.match(practice, /Elegir otra pregunta/u);
assert.match(practice, /Reintentar verificación/u);
assert.match(scss, /\.study-practice-focused/u);
assert.doesNotMatch(practice, /localStorage|sessionStorage|IndexedDB/iu);
assert.match(oldTest, /const shownAnswers = revealed/u);
assert.match(focusTest, /practiceQuestionHref\(/u);
assert.match(focusTest, /No abrimos otra pregunta/u);

const brokenLine = /it\('keeps v1 only if the owner's private collection set is empty'/u;
const fixedLine = /it\("keeps v1 only if the owner\\'s private collection set is empty"/u;
assert.doesNotMatch(exportSpec, brokenLine);
assert.match(exportSpec, fixedLine);
assert.match(exportSpec, /keeps v1 only if the owner/u);
assert.match(versioning, /hasOwnedCollections\(userId\)/u);

// The feature is isolated from private collection write behavior and remains
// unexposed if the backend flag is not explicitly enabled.
assert.match(collectionService, /\?expectedRevision=/u);
assert.match(backend, /STUDY_COLLECTION_REFERENCE_ACCESSIBLE/u);
assert.match(env, /'STUDY_COLLECTIONS_ENABLED',\s*false/u);
console.log("PASS B58 practice focus / export syntax / B57 compatibility contracts");
