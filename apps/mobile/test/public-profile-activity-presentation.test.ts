import assert from "node:assert/strict";
import test from "node:test";
import type { ProfileActivity } from "@losapuntes/contracts";

import { publicProfileActivityPresentation } from "../src/features/search/public-profile-activity-presentation";

test("public activity presentation labels every supported activity type", () => {
  const labels: Array<[ProfileActivity["type"], string]> = [
    ["project", "Proyecto"],
    ["research", "Investigación"],
    ["club", "Club"],
    ["volunteering", "Voluntariado"],
    ["academic_work", "Trabajo académico"],
  ];

  for (const [type, typeLabel] of labels) {
    assert.equal(
      publicProfileActivityPresentation({
        type,
        startedOn: null,
        endedOn: null,
      }).typeLabel,
      typeLabel,
    );
  }
});

test("public activity presentation formats partial and complete date ranges without timezone conversion", () => {
  assert.equal(
    publicProfileActivityPresentation({
      type: "project",
      startedOn: "2024-03",
      endedOn: "2025",
    }).dateLabel,
    "2024-03 – 2025",
  );
  assert.equal(
    publicProfileActivityPresentation({
      type: "research",
      startedOn: "2026",
      endedOn: null,
    }).dateLabel,
    "Desde 2026",
  );
  assert.equal(
    publicProfileActivityPresentation({
      type: "club",
      startedOn: null,
      endedOn: "2023-09",
    }).dateLabel,
    "Hasta 2023-09",
  );
  assert.equal(
    publicProfileActivityPresentation({
      type: "volunteering",
      startedOn: null,
      endedOn: null,
    }).dateLabel,
    null,
  );
});
