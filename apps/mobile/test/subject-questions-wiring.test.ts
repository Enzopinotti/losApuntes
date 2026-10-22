import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

function file(path: string): string {
  return readFileSync(new URL(path, import.meta.url), "utf8");
}

test("search subject results and contextual buckets offer direct Q&A access", () => {
  const screen = file("../src/features/search/search-screen.tsx");
  assert.match(screen, /function SubjectGroup\(/u);
  assert.match(screen, /function ContextualDiscovery\(/u);
  assert.match(screen, /onOpenQuestions=\{openSubjectQuestions\}/u);
  assert.match(screen, /Ver preguntas de esta materia/u);
  assert.match(screen, /pathname: "\/questions\/subjects\/\[subjectId\]"/u);
  assert.match(screen, /onOpenQuestions\(subject\.id\)/u);
  assert.match(screen, /onOpenQuestions\(bucket\.subject\.id\)/u);
});

test("subject route is validated before requesting backend Q&A", () => {
  const route = file("../src/app/questions/subjects/[subjectId].tsx");
  const screen = file("../src/features/community/subject-questions-screen.tsx");
  assert.match(route, /subjectQuestionsRouteId\(subjectId\)/u);
  assert.match(screen, /!subjectId/u);
  assert.match(screen, /El enlace de la materia no es válido/u);
  assert.match(screen, /controller\.load\(scopeKey, searchInput\)/u);
  assert.match(screen, /controller\.loadMore\(scopeKey\)/u);
  assert.match(screen, /controller\.invalidate\(scopeKey\)/u);
  assert.match(screen, /useCommunityAuthority\(\)/u);
  assert.match(screen, /authority.scope.kind !== "unresolved"/u);
  assert.match(screen, /El contexto académico está desactualizado/u);
});

test("subject question status filters use new scoped server pages", () => {
  const screen = file("../src/features/community/subject-questions-screen.tsx");
  assert.match(screen, /value: "all"/u);
  assert.match(screen, /value: "open"/u);
  assert.match(screen, /value: "closed"/u);
  assert.match(screen, /status: statusFilter/u);
  assert.match(screen, /questions-subject:/u);
  assert.match(screen, /controller\.load\(scopeKey, searchInput\)/u);
  assert.match(screen, /“cerrada” no significa/u);
});

test("read-only subject browsing cannot spoof a question publishing context", () => {
  const screen = file("../src/features/community/subject-questions-screen.tsx");
  const policy = file("../src/features/community/subject-questions-policy.ts");
  assert.match(screen, /canComposeForSubject\(/u);
  assert.match(screen, /router\.push\("\/questions\/new"\)/u);
  assert.match(policy, /scope\.subjectId === requestedSubjectId/u);
  assert.match(screen, /primero seleccioná esta materia/u);
  assert.doesNotMatch(screen, /createQuestion\(/u);
  assert.doesNotMatch(screen, /createQuestionInput/u);
});

test("question cards navigate to existing server-authorized details", () => {
  const screen = file("../src/features/community/subject-questions-screen.tsx");
  assert.match(screen, /pathname: "\/questions\/\[questionId\]"/u);
  assert.match(screen, /question\.academic\.subject\.name/u);
  assert.match(screen, /question\.answerCount/u);
  assert.match(screen, /current\.page\.nextCursor/u);
  assert.match(screen, /current\.loadMoreFailure/u);
});
