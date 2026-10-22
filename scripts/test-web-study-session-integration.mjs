import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
const root = new URL("../", import.meta.url);
function source(path) {
  return readFileSync(new URL(path, root), "utf8");
}
const routes = source("apps/web/src/app/routes.tsx");
const workbench = source("apps/web/src/pages/StudyWorkbench.tsx");
const page = source("apps/web/src/pages/StudySession.tsx");
const plan = source("apps/web/src/features/study/study-session-plan.mjs");
assert.match(routes, /path: "study\/session"[\s\S]*?<PrivateRoute>/u);
assert.match(workbench, /Preparar sesión de estudio/u);
assert.match(page, /subjectLimit: 8, resourcesPerSubject: 1/u);
assert.match(page, /studySubjectSelectionFromParams\(params\)/u);
assert.match(page, /resourcesApi\.savedBySubject/u);
assert.match(page, /resourcesApi\.search/u);
assert.match(page, /communityApi\.questions/u);
assert.match(page, /verifyTaskLabels\(imported, ticket\.signal\)/u);
assert.match(page, /verifyTaskLabels\(normalized, ticket\.signal\)/u);
assert.match(page, /response\.resource\.academic\.subject\.id === plan\.subjectId/u);
assert.match(page, /response\.question\.academic\.subject\.id === plan\.subjectId/u);
assert.match(page, /Math\.min\(4, plan\.tasks\.length\)/u);
assert.match(page, /draftState\?\.scope === scope/u);
assert.match(page, /actionCurrent\(ticket\)/u);
assert.match(page, /overBudget/u);
assert.match(page, /URL\.revokeObjectURL/u);
assert.doesNotMatch(page, /localStorage|sessionStorage|indexedDB/iu);
assert.doesNotMatch(plan, /author\.displayName|grantedAt|signedUrl/u);
console.log("Study session integration assertions PASS");
