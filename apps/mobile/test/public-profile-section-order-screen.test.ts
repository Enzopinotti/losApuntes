import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

const screen = readFileSync(
  new URL("../src/features/search/search-result-screens.tsx", import.meta.url),
  "utf8",
);

test("Mobile public profile orders only its projected content cards", () => {
  assert.match(screen, /profile\.presentation\.sectionOrder/u);
  assert.match(screen, /orderedSections\.map\(\(section\)/u);
  assert.match(screen, /case "academic"/u);
  assert.match(screen, /case "activities"/u);
  assert.match(screen, /<PublicProfileSections profile=\{data\.profile\}/u);
});
