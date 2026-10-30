import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

const screen = readFileSync(
  new URL("../src/features/search/search-result-screens.tsx", import.meta.url),
  "utf8",
);

test("public Mobile profile uses server section order while keeping rich activity", () => {
  assert.match(screen, /profile\.presentation\.sectionOrder/u);
  assert.match(screen, /publicProfileContentSectionOrder/u);
  assert.match(screen, /section === "academic"/u);
  assert.match(screen, /section === "activities"/u);
  assert.match(screen, /<PublicProfileSections/u);
  assert.match(screen, /publicProfileActivityPresentation\(activity\)/u);
  assert.match(screen, /<PublicProfileActivityLink/u);
  assert.match(screen, /<SocialProfileConnectionAction/u);
  assert.match(screen, /<SocialProfileFollowAction/u);
  assert.match(screen, /<SharePublicProfileAction/u);
});