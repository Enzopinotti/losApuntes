import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import type { ResourceView } from "@losapuntes/contracts";

import { savedSubjectQuestionsAction } from "../src/features/resources/saved-subject-questions-action";

const subject = (
  id: string,
  name = "Física II",
): Pick<ResourceView, "academic"> => ({
  academic: {
    subject: { id, name },
    courseOffering: null,
  },
});

const subjectId = "123e4567-e89b-42d3-a456-426614174000";

test("saved resource links to the existing subject-scoped Q&A route", () => {
  const action = savedSubjectQuestionsAction(subject(subjectId));
  assert.deepEqual(action?.href, {
    pathname: "/questions/subjects/[subjectId]",
    params: { subjectId },
  });
  assert.equal(action?.accessibilityLabel, "Ver preguntas de Física II");
  assert.match(action?.accessibilityHint ?? "", /servidor vuelve a validar/u);
});

test("canonical subject IDs are normalized without inventing posting authority", () => {
  const action = savedSubjectQuestionsAction(
    subject("123E4567-E89B-42D3-A456-426614174000"),
  );
  assert.deepEqual(action?.href, {
    pathname: "/questions/subjects/[subjectId]",
    params: { subjectId },
  });
  assert.match(action?.accessibilityHint ?? "", /contexto para publicar/u);
});

test("missing, malformed or injected subject IDs cannot open the Q&A route", () => {
  for (const id of [
    "",
    "subject-1",
    subjectId + "/../private",
    subjectId + "?token=secret",
    "javascript:alert(1)",
    "123e4567-e89b-12d3-a456-426614174000",
  ]) {
    assert.equal(savedSubjectQuestionsAction(subject(id)), null, id);
  }
});

test("saved-resource row keeps resource, questions and unsave as distinct actions", () => {
  const screen = readFileSync(
    new URL("../src/features/resources/saved-resources-screen.tsx", import.meta.url),
    "utf8",
  );
  const questions = readFileSync(
    new URL("../src/features/community/subject-questions-screen.tsx", import.meta.url),
    "utf8",
  );

  assert.match(screen, /savedSubjectQuestionsAction\(resource\)/u);
  assert.match(screen, /onOpenQuestions\(questionsAction\)/u);
  assert.match(screen, /onPress=\{onOpen\}/u);
  assert.match(screen, /onPress=\{onRemove\}/u);
  assert.match(screen, /router\.push\(action\.href\)/u);
  assert.match(questions, /canComposeForSubject\(/u);
  assert.match(questions, /authority\.gate === "ready"/u);
  assert.match(questions, /accessibilityLabel="Volver a la pantalla anterior"/u);
  assert.doesNotMatch(screen, /setSubjectParticipation|autoEnroll/u);
});
