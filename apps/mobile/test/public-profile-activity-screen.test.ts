import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

const screen = readFileSync(
  new URL(
    "../src/features/search/public-profile-activities.tsx",
    import.meta.url,
  ),
  "utf8",
);

test("public activity cards show server-projected type, title, description and date", () => {
  assert.match(screen, /publicProfileActivityPresentation\(activity\)/u);
  assert.match(screen, /activity\.title/u);
  assert.match(screen, /presentation.typeLabel/u);
  assert.match(screen, /activity\.description/u);
  assert.match(screen, /presentation\.dateLabel/u);
});
