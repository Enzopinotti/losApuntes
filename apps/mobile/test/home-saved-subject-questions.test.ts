import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import type { ResourceView } from "@losapuntes/contracts";

import { savedSubjectQuestionsAction } from "../src/features/resources/saved-subject-questions-action";

const SUBJECT = "11111111-1111-4111-8111-111111111111";

const resource = (id: string) =>
  ({
    academic: {
      subject: { id, name: "Álgebra" },
      courseOffering: null,
    },
  }) as Pick<ResourceView, "academic">;

function cardSource(): string {
  return readFileSync(
    new URL("../src/features/home/home-saved-return-card.tsx", import.meta.url),
    "utf8",
  );
}

test("Home saved preview exposes an existing Q&A route only for a canonical Subject", () => {
  const eligible = savedSubjectQuestionsAction(resource(SUBJECT));
  assert.deepEqual(eligible?.href, {
    pathname: "/questions/subjects/[subjectId]",
    params: { subjectId: SUBJECT },
  });
  assert.match(eligible?.accessibilityHint ?? "", /servidor vuelve a validar/u);

  for (const id of [
    "",
    "wrong-subject",
    "../secret",
    SUBJECT + "?user=other",
  ]) {
    assert.equal(savedSubjectQuestionsAction(resource(id)), null);
  }
});

test("Home saved card keeps resource and Q&A as separate accessible actions", () => {
  const screen = cardSource();
  assert.match(screen, /savedSubjectQuestionsAction\(resource\)/u);
  assert.match(
    screen,
    /<View key=\{resource\.id\} style=\{styles\.savedItem\}>/u,
  );
  assert.match(screen, /pathname: "\/resources\/\[id\]"/u);
  assert.match(
    screen,
    /onPress=\{\(\) => router\.push\(questionsAction\.href\)\}/u,
  );
  assert.match(
    screen,
    /accessibilityLabel=\{questionsAction\.accessibilityLabel\}/u,
  );
  assert.match(
    screen,
    /accessibilityHint=\{questionsAction\.accessibilityHint\}/u,
  );
  assert.match(screen, /minHeight: 44/u);
  assert.match(screen, /Preguntas de la materia/u);
  assert.match(screen, /\{questionsAction \? \(/u);
});

test("Q&A shortcut neither grants publishing rights nor skips reauthorization", () => {
  const screen = cardSource();
  const qna = readFileSync(
    new URL(
      "../src/features/community/subject-questions-screen.tsx",
      import.meta.url,
    ),
    "utf8",
  );
  assert.match(screen, /snapshot\.authorityKey === authorityKey/u);
  assert.match(screen, /controller\.invalidate\(authorityKey\)/u);
  assert.match(qna, /useCommunityAuthority\(\)/u);
  assert.match(qna, /canComposeForSubject\(/u);
  assert.doesNotMatch(screen, /createQuestion\(|grantShare\(|autoEnroll/u);
});

test("Home preserves saved-library navigation, recoverable failures and bounded preview", () => {
  const screen = cardSource();
  assert.match(screen, /controller\.load\(authorityKey\)/u);
  assert.match(screen, /\/saved-resources/u);
  assert.match(screen, /Reintentar consulta de apuntes guardados/u);
  assert.match(screen, /current\.items\.map/u);
  assert.doesNotMatch(screen, /SecureStore|AsyncStorage|access\.url/u);
});
