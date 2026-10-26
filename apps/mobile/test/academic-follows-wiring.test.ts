import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

test("academic context links to the authenticated follow management screen", () => {
  const contextCard = readFileSync(
    new URL(
      "../src/features/academic/academic-context-card.tsx",
      import.meta.url,
    ),
    "utf8",
  );
  const route = readFileSync(
    new URL("../src/app/academic/follows.tsx", import.meta.url),
    "utf8",
  );
  const screen = readFileSync(
    new URL(
      "../src/features/academic/academic-follows-screen.tsx",
      import.meta.url,
    ),
    "utf8",
  );

  assert.match(contextCard, /router\.push\("\/academic\/follows"\)/u);
  assert.match(route, /AcademicFollowsScreen/u);
  assert.match(screen, /activeNavigationAuthorityKey/u);
  assert.match(screen, /controller\.toggleFollow\(authorityKey/u);
  assert.match(screen, /current\.searchCursorRepeated/u);
  assert.match(screen, /El catálogo repitió una página/u);
  assert.match(screen, /Mostramos hasta \{current\.limit\} seguimientos/u);
});
