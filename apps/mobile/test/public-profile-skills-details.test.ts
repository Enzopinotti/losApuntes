import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

const screen = readFileSync(
  new URL("../src/features/search/search-result-screens.tsx", import.meta.url),
  "utf8",
);

test("public Mobile profiles render the server-projected skills, interests and languages", () => {
  assert.match(screen, /data\.profile\.skills\?\.skills\.length/u);
  assert.match(screen, /data\.profile\.skills\.interests\.join\(", "\)/u);
  assert.match(screen, /data\.profile\.skills\.languages\.join\(", "\)/u);
  assert.match(screen, /Intereses:/u);
  assert.match(screen, /Idiomas:/u);
});
