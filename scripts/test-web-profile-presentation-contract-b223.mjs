import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";

const read = (name) => readFile(path.join(process.cwd(), name), "utf8");
const [contract, apiDto] = await Promise.all([
  read("packages/contracts/src/profile.ts"),
  read("apps/api/src/profile/dto/profile.dto.ts"),
]);

const accentDeclaration =
  contract.match(/export type ProfileAccentPreset =([^;]+);/u)?.[1] ?? "";
const coverDeclaration =
  contract.match(/export type ProfileCoverPreset =([^;]+);/u)?.[1] ?? "";
for (const value of [
  "default",
  "indigo",
  "emerald",
  "amber",
  "rose",
  "slate",
]) {
  assert.match(accentDeclaration, new RegExp(`"${value}"`, "u"));
}
for (const value of ["none", "gradient", "paper", "campus"]) {
  assert.match(coverDeclaration, new RegExp(`"${value}"`, "u"));
}
assert.match(
  contract,
  /presentation\?:\s*\{[\s\S]*?accentPreset\?: ProfileAccentPreset/u,
);
assert.match(contract, /coverPreset\?: ProfileCoverPreset/u);
assert.match(contract, /sectionOrder\?: ProfileSection\[\]/u);
assert.match(apiDto, /@IsIn\(PROFILE_ACCENT_PRESETS\)/u);
assert.match(apiDto, /@IsIn\(PROFILE_COVER_PRESETS\)/u);

console.log("PASS profile presentation update contract");
