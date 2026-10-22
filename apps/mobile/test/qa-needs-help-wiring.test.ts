import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

test("a canonical subject opens the needs-help lane and results open question detail", () => {
  const subjectScreen = readFileSync(
    new URL(
      "../src/features/community/subject-questions-screen.tsx",
      import.meta.url,
    ),
    "utf8",
  );
  const route = readFileSync(
    new URL(
      "../src/app/questions/subjects/[subjectId]/needs-help.tsx",
      import.meta.url,
    ),
    "utf8",
  );
  const screen = readFileSync(
    new URL(
      "../src/features/community/qa-needs-help-screen.tsx",
      import.meta.url,
    ),
    "utf8",
  );

  assert.match(subjectScreen, /Ver preguntas que necesitan ayuda/u);
  assert.match(
    subjectScreen,
    /pathname: "\/questions\/subjects\/\[subjectId\]\/needs-help"/u,
  );
  assert.match(route, /subjectQuestionsRouteId\(subjectId\)/u);
  assert.match(screen, /pathname: "\/questions\/\[questionId\]"/u);
  assert.match(screen, /La antigüedad no indica urgencia/u);
  assert.doesNotMatch(screen, /authorId|authorName|questionBody|answerBody/u);
});
