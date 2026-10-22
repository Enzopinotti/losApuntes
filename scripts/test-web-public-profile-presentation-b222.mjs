import assert from "node:assert/strict";
import { publicProfilePresentationPresets } from "../apps/web/src/features/profile/public-profile-presentation.ts";

for (const accentPreset of [
  "default",
  "indigo",
  "emerald",
  "amber",
  "rose",
  "slate",
]) {
  assert.equal(
    publicProfilePresentationPresets(accentPreset, "none").accentPreset,
    accentPreset,
  );
}

for (const coverPreset of ["none", "gradient", "paper", "campus"]) {
  assert.equal(
    publicProfilePresentationPresets("default", coverPreset).coverPreset,
    coverPreset,
  );
}

assert.deepEqual(publicProfilePresentationPresets("script", "image-url"), {
  accentPreset: "default",
  coverPreset: "none",
});
assert.deepEqual(publicProfilePresentationPresets("", ""), {
  accentPreset: "default",
  coverPreset: "none",
});

console.log("PASS public profile presentation preset policy");
