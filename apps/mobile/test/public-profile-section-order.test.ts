import assert from "node:assert/strict";
import test from "node:test";
import type { ProfileSection } from "@losapuntes/contracts";
import { publicProfileContentSectionOrder } from "../src/features/search/public-profile-section-order";

test("public Mobile profile cards follow server order and omit unavailable sections", () => {
  const available = new Set<ProfileSection>([
    "professional",
    "skills",
    "activities",
  ]);
  assert.deepEqual(
    publicProfileContentSectionOrder(
      [
        "about",
        "activities",
        "academic",
        "skills",
        "professional",
        "activities",
        "contributions",
      ],
      available,
    ),
    ["activities", "skills", "professional"],
  );
});

test("empty projections never produce phantom cards", () => {
  assert.deepEqual(
    publicProfileContentSectionOrder(
      ["professional", "academic", "activities"],
      new Set<ProfileSection>(),
    ),
    [],
  );
});
