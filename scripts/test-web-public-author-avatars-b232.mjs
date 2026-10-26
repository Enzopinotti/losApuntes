import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";

const read = (relativePath) =>
  readFile(path.join(process.cwd(), relativePath), "utf8");

const [link, avatar, policy, search, resources] = await Promise.all([
  read("apps/web/src/features/profile/AuthorProfileLink.tsx"),
  read("apps/web/src/features/profile/public-profile-avatar.tsx"),
  read("apps/web/src/features/profile/public-profile-avatar-policy.ts"),
  read("apps/web/src/pages/Search.tsx"),
  read("apps/web/src/pages/Resources.tsx"),
]);

assert.match(link, /if \(!profileId \|\| profileId\.trim\(\) !== profileId\)/u);
assert.match(
  link,
  /<PublicProfileAvatar[\s\S]*?avatarUrl=\{avatarUrl\}[\s\S]*?displayName=\{visibleName\}[\s\S]*?size="compact"/u,
);
assert.match(avatar, /publicProfileAvatarUrl\(avatarUrl\)/u);
assert.match(avatar, /public-profile-avatar--compact/u);
assert.match(policy, /url\.protocol !== "https:"/u);
assert.match(policy, /url\.username \|\|/u);
assert.match(search, /avatarUrl=\{resource\.author\?\.avatarUrl\}/u);
assert.match(resources, /avatarUrl=\{resource\.author\?\.avatarUrl\}/u);

console.log("PASS Web public author avatar presentation contract");
