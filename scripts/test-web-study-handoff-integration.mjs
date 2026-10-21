import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resourceToStudyHandoffPlan } from "../apps/web/src/features/study/resource-study-handoff.mjs";
import {
  createStudyHandoff,
  inspectStudyHandoff,
  finishStudyHandoff,
} from "../apps/web/src/features/study/study-session-handoff.mjs";

const root = new URL("../", import.meta.url);
const src = (path) => readFileSync(new URL(path, root), "utf8");
const practice = src("apps/web/src/pages/StudyPractice.tsx");
const session = src("apps/web/src/pages/StudySession.tsx");
const model = src("apps/web/src/features/study/study-session-handoff.mjs");
const practiceStyles = src("apps/web/src/pages/StudyPractice.scss");
const sessionStyles = src("apps/web/src/pages/StudySession.scss");

assert.match(practice, /useNavigate/u);
assert.match(practice, /const openPendingInPlanner = \(\) =>/u);
assert.match(practice, /recallToStudySession\(subjectId, round\.ids, round\.outcomes\)/u);
assert.match(practice, /createStudyHandoff\(plan, scope\)/u);
assert.match(practice, /state: handoff/u);
assert.match(practice, /window\.confirm/u);
assert.match(practice, /Pasar pendientes al Planificador/u);
assert.match(practice, /Descargar plan JSON/u);
assert.match(session, /useLocation/u);
assert.match(session, /recallStudyDraft\(scope, subjectId\)/u);
assert.match(session, /rememberStudyDraft\(scope, draftState\.plan\)/u);
assert.match(session, /if \(plan\) rememberStudyDraft\(scope, plan\)/u);
assert.match(session, /resumedPlan \?\? emptyStudySession\(subjectId\)/u);
assert.match(session, /plan \?\? emptyStudySession\(subjectId\), labels/u);
assert.match(session, /Vaciar mi borrador/u);
assert.match(session, /const incomingHandoff = subjectId/u);
assert.match(session, /inspectStudyHandoff\(location\.state, scope, subjectId\)/u);
assert.match(session, /isStudyHandoffRouteState\(location\.state\)/u);
assert.match(session, /const applyDirectHandoff = async/u);
assert.match(session, /mergeStudySessionHandoff\(plan, incoming\)/u);
assert.match(session, /verifyTaskLabels\(candidate\.plan, ticket\.signal\)/u);
assert.match(session, /actionCurrent\(ticket\)/u);
assert.match(session, /updateTaskAuthorities\(candidate\.plan, verified\)/u);
assert.match(session, /finishStudyHandoff\(location\.state, scope\)/u);
assert.match(session, /replace: true/u);
assert.match(session, /state: null/u);
assert.match(session, /onClick=\{\(\) => void applyDirectHandoff\("append"\)\}/u);
assert.match(session, /onClick=\{\(\) => void applyDirectHandoff\("replace"\)\}/u);
assert.match(session, /onClick=\{dismissDirectHandoff\}/u);
assert.match(session, /window\.confirm/u);
assert.match(session, /STUDY_HANDOFF_TASK_LIMIT/u);
assert.match(session, /STUDY_HANDOFF_TIME_LIMIT/u);
assert.match(sessionStyles, /\.study-session-handoff/u);
assert.match(model, /const entries = new Map\(\)/u);
assert.match(model, /const MAX_PENDING = 5/u);
assert.match(model, /const STUDY_HANDOFF_TTL_MS = 10 \* 60 \* 1000|export const STUDY_HANDOFF_TTL_MS = 10 \* 60 \* 1000/u);
assert.match(model, /entry\.scope !== scope/u);
assert.match(model, /entries\.delete\(token\)/u);
assert.match(model, /normalizeStudySession\(entry\.plan\)/u);
assert.doesNotMatch(model, /\b(?:localStorage|sessionStorage|indexedDB)\s*\.|\bfetch\(/iu);
assert.doesNotMatch(practice, /JSON\.stringify\(round\.reflections\)/u);
assert.ok(practiceStyles.includes(".study-practice")); 

const subjectId = "a1af6e19-7bc8-44b0-b3f5-7fb7746b1e80";
const resourceId = "a1af6e19-7bc8-44b0-b3f5-7fb7746b1e81";
const otherSubjectId = "a1af6e19-7bc8-44b0-b3f5-7fb7746b1e82";
const freshResource = {
  id: resourceId,
  title: "No debería viajar al Planificador",
  file: { url: "https://example.invalid/private-document" },
  author: { displayName: "Nombre privado" },
  academic: { subject: { id: subjectId, name: "Materia actual" } },
};
const currentSubjects = {
  subjects: [{ subject: { id: subjectId, name: "Materia actual" } }],
};
const studyPlan = resourceToStudyHandoffPlan(
  freshResource,
  currentSubjects,
  resourceId,
);
assert.ok(studyPlan, "The current, rechecked subject resource must be eligible");
assert.equal(studyPlan.subjectId, subjectId);
assert.deepEqual(studyPlan.tasks, [
  { kind: "resource", id: resourceId, minutes: 25, done: false },
]);
for (const privateValue of [
  freshResource.title,
  freshResource.author.displayName,
  freshResource.file.url,
  freshResource.academic.subject.name,
]) {
  assert.ok(
    !JSON.stringify(studyPlan).includes(privateValue),
    "The one-resource handoff may not carry titles, URLs or identity fields",
  );
}
for (const [value, context, expected] of [
  [freshResource, { subjects: [] }, resourceId],
  [freshResource, { subjects: [{ subject: { id: otherSubjectId } }] }, resourceId],
  [freshResource, null, resourceId],
  [freshResource, { subjects: "untrusted" }, resourceId],
  [freshResource, currentSubjects, otherSubjectId],
  [freshResource, currentSubjects, "invalid"],
  [{ ...freshResource, id: "broken" }, currentSubjects, resourceId],
  [
    { ...freshResource, academic: { subject: { id: otherSubjectId } } },
    currentSubjects,
    resourceId,
  ],
  [null, currentSubjects, resourceId],
]) {
  assert.equal(
    resourceToStudyHandoffPlan(value, context, expected),
    null,
    "Missing membership, changed subject and malformed IDs must reject the handoff",
  );
}
const authorityScope = "authenticated:user-a:session-a";
const scopedSession = `${authorityScope}:${subjectId}`;
const now = 1_750_000_000_000;
const routeState = createStudyHandoff(studyPlan, scopedSession, now);
assert.deepEqual(
  inspectStudyHandoff(routeState, scopedSession, subjectId, now + 1),
  studyPlan,
);
assert.equal(
  inspectStudyHandoff(
    routeState,
    `authenticated:user-a:session-b:${subjectId}`,
    subjectId,
    now + 1,
  ),
  null,
);
assert.equal(
  inspectStudyHandoff(routeState, scopedSession, otherSubjectId, now + 1),
  null,
);
assert.deepEqual(
  Object.keys(routeState).sort(),
  ["kind", "token", "version"],
  "The route carries only an opaque one-time nonce",
);
assert.equal(finishStudyHandoff(routeState, scopedSession), true);
assert.equal(inspectStudyHandoff(routeState, scopedSession, subjectId, now + 2), null);
const expiringState = createStudyHandoff(studyPlan, scopedSession, now);
assert.equal(
  inspectStudyHandoff(expiringState, scopedSession, subjectId, now + 601_000),
  null,
  "Expired resource handoffs must not resume",
);

const resourceHandoff = src(
  "apps/web/src/features/study/ResourceStudyHandoff.tsx",
);
const resources = src("apps/web/src/pages/Resources.tsx");
const resourceStyles = src("apps/web/src/pages/Resources.scss");
assert.match(resourceHandoff, /resourcesApi\.get\(resourceId, ticket\.signal\)/u);
assert.match(resourceHandoff, /searchApi\.contextual\(/u);
assert.match(resourceHandoff, /subjectLimit: 8, resourcesPerSubject: 1/u);
assert.match(resourceHandoff, /resourceToStudyHandoffPlan\(/u);
assert.match(resourceHandoff, /createStudyHandoff\(/u);
assert.match(resourceHandoff, /isCurrent\(ticket\)/u);
assert.match(resourceHandoff, /useAsyncAuthorityFence\(scope\)/u);
assert.match(resourceHandoff, /pending\.current/u);
assert.match(resourceHandoff, /ticket\.signal/u);
assert.match(resourceHandoff, /state: handoff/u);
assert.match(resourceHandoff, /encodeURIComponent\(plan\.subjectId\)/u);
assert.match(resourceHandoff, /Este apunte no pertenece/u);
assert.match(resourceHandoff, /role="alert"/u);
assert.doesNotMatch(resourceHandoff, /localStorage|sessionStorage|indexedDB/u);
assert.doesNotMatch(resourceHandoff, /Authorization\s*:|Bearer\s+/iu);
assert.match(resources, /<ResourceStudyHandoff/u);
assert.match(resources, /resource\.id\.toLowerCase\(\) === resourceId\.toLowerCase\(\)/u);
assert.match(resources, /session\?\.id \?\? "none"/u);
assert.match(resources, /resourceId=\{resource\.id\}/u);
assert.match(resourceStyles, /\.resource-study-handoff button:focus-visible/u);
assert.match(resourceStyles, /\.resource-study-handoff p\[role="alert"\]/u);

console.log("Study handoff integration checks PASS");
