import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";

const [contract, apiDto, apiService] = await Promise.all([
  readFile(
    path.join(process.cwd(), "packages/contracts/src/profile.ts"),
    "utf8",
  ),
  readFile(
    path.join(process.cwd(), "apps/api/src/profile/dto/profile.dto.ts"),
    "utf8",
  ),
  readFile(
    path.join(process.cwd(), "apps/api/src/profile/domain/profile.service.ts"),
    "utf8",
  ),
]);

assert.match(
  contract,
  /export type UpdateProfileActivityInput = \{\s*expectedRevision: number;/u,
);
for (const field of [
  "type",
  "title",
  "description",
  "url",
  "startedOn",
  "endedOn",
]) {
  assert.match(contract, new RegExp(`\\b${field}\\?:`, "u"));
  assert.match(apiDto, new RegExp(`\\b${field}\\?:`, "u"));
}
assert.match(apiService, /PROFILE_ACTIVITY_REVISION_CONFLICT/u);

console.log("PASS profile activity update contract");
