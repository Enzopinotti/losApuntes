import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";

const read = (relativePath) =>
  readFile(path.join(process.cwd(), relativePath), "utf8");

const [network, avatar, policy, avatarStyles, communityStyles, profileStyles] =
  await Promise.all([
    read("apps/web/src/pages/Network.tsx"),
    read("apps/web/src/features/profile/public-profile-avatar.tsx"),
    read("apps/web/src/features/profile/public-profile-avatar-policy.ts"),
    read("apps/web/src/features/profile/public-profile-avatar.scss"),
    read("apps/web/src/pages/Community.scss"),
    read("apps/web/src/pages/Profile.scss"),
  ]);

assert.match(network, /import \{ PublicProfileAvatar \}/u);
assert.match(
  network,
  /avatarUrl=\{person\.avatarUrl\}[\s\S]*?displayName=\{person\.displayName\}[\s\S]*?size="small"/u,
  "Search results must render their public avatar beside the name",
);
assert.match(
  network,
  /avatarUrl=\{item\.profile\.avatarUrl\}[\s\S]*?displayName=\{item\.profile\.displayName\}[\s\S]*?size="small"/u,
  "Following rows must render their public avatar beside the name",
);
assert.match(
  network,
  /avatarUrl=\{connection\.other\.avatarUrl\}[\s\S]*?displayName=\{connection\.other\.displayName\}[\s\S]*?size="small"/u,
  "Connection rows must render their public avatar beside the name",
);
assert.match(avatar, /publicProfileAvatarUrl\(avatarUrl\)/u);
assert.match(avatar, /small:\s*" public-profile-avatar--small"/u);
assert.match(avatar, /compact:\s*" public-profile-avatar--compact"/u);
assert.match(avatar, /feed:\s*" public-profile-avatar--feed"/u);
assert.match(
  avatar,
  /className=\{`public-profile-avatar\$\{sizeClasses\[size\]\}`\}/u,
);
assert.match(avatar, /event\.currentTarget\.hidden = true/u);
assert.match(policy, /url\.protocol !== "https:"/u);
assert.match(policy, /url\.username \|\|/u);
assert.match(avatarStyles, /\.public-profile-avatar--small/u);
assert.match(communityStyles, /\.network-person-summary/u);
assert.match(profileStyles, /.public-profile \.public-profile-avatar/u);
assert.doesNotMatch(profileStyles, /^\.public-profile-avatar \{/mu);

console.log("PASS Web Network person avatar presentation contract");
