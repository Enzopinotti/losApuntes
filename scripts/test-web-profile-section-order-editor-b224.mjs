import assert from "node:assert/strict";
import { moveProfileSectionOrder } from "../apps/web/src/features/profile/profile-section-order.ts";

const order = [
  "about",
  "academic",
  "learning",
  "activities",
  "skills",
  "professional",
  "contributions",
];

assert.deepEqual(moveProfileSectionOrder(order, "activities", -1), [
  "about",
  "academic",
  "activities",
  "learning",
  "skills",
  "professional",
  "contributions",
]);
assert.deepEqual(moveProfileSectionOrder(order, "skills", 1), [
  "about",
  "academic",
  "learning",
  "activities",
  "professional",
  "skills",
  "contributions",
]);
assert.deepEqual(moveProfileSectionOrder(order, "about", -1), order);
assert.deepEqual(moveProfileSectionOrder(order, "contributions", 1), order);
assert.deepEqual(order, [
  "about",
  "academic",
  "learning",
  "activities",
  "skills",
  "professional",
  "contributions",
]);

console.log("PASS profile section order editor policy");
