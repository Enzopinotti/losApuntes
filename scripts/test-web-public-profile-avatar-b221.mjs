import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";

const [page, avatar] = await Promise.all([
  readFile(
    path.join(process.cwd(), "apps/web/src/pages/PublicProfile.tsx"),
    "utf8",
  ),
  readFile(
    path.join(
      process.cwd(),
      "apps/web/src/features/profile/public-profile-avatar.tsx",
    ),
    "utf8",
  ),
]);

assert.match(page, /PublicProfileAvatar/u);
assert.match(page, /profile\.about\?\.displayName \? \(/u);
assert.match(page, /avatarUrl=\{profile\.about\.avatarUrl\}/u);
assert.match(avatar, /publicProfileAvatarUrl\(avatarUrl\)/u);
assert.match(avatar, /aria-hidden="true"/u);
assert.match(avatar, /onError=\{/u);
assert.match(avatar, /event\.currentTarget\.hidden = true/u);

console.log("PASS Web public profile avatar UI contract");
