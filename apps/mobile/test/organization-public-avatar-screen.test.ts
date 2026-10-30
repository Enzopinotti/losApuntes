import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

const directory = readFileSync(
  new URL(
    "../src/features/organizations/organizations-directory-screen.tsx",
    import.meta.url,
  ),
  "utf8",
);
const detail = readFileSync(
  new URL(
    "../src/features/organizations/organization-detail-screen.tsx",
    import.meta.url,
  ),
  "utf8",
);
const avatar = readFileSync(
  new URL("../src/features/profile/public-avatar.tsx", import.meta.url),
  "utf8",
);

test("organization avatars use only the public server projection", () => {
  assert.match(directory, /avatarUrl=\{organization\.avatarUrl\}/u);
  assert.match(detail, /avatarUrl=\{current\.organization\.avatarUrl\}/u);
  assert.match(directory, /displayName=\{organization\.name\}/u);
  assert.match(detail, /displayName=\{current\.organization\.name\}/u);
  assert.match(avatar, /publicAvatarUrl\(avatarUrl\)/u);
  assert.doesNotMatch(directory, /profile\.private|credential|sessionToken/u);
});

test("avatar preserves accessible title and native organization sharing", () => {
  assert.match(directory, /Abrir organización/u);
  assert.match(detail, /accessibilityRole="header"/u);
  assert.match(detail, /Compartir organización/u);
});
