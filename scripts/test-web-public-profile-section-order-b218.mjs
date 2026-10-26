import assert from "node:assert/strict";
import { publicProfileContentSectionOrder } from "../apps/web/src/features/profile/public-profile-section-order.ts";

const available = new Set(["skills", "learning", "academic", "activities"]);
assert.deepEqual(
  publicProfileContentSectionOrder(
    [
      "about",
      "activities",
      "learning",
      "skills",
      "professional",
      "activities",
      "contributions",
      "academic",
    ],
    available,
  ),
  ["activities", "learning", "skills", "academic"],
);

console.log("PASS Web public profile section ordering");
