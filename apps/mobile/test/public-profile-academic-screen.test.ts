import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

const screen = readFileSync(
  new URL("../src/features/search/search-result-screens.tsx", import.meta.url),
  "utf8",
);

test("public profile only renders academic summary when the server includes it", () => {
  assert.match(screen, /profile\.academic\s*\?\s*\(/u);
  assert.match(screen, /publicProfileAcademicSummary\(profile\.academic\)/u);
  assert.match(screen, /Trayectoria académica/u);
});
