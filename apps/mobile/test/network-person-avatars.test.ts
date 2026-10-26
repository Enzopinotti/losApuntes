import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { networkPersonAvatarUrl } from "../src/features/community/network-person-avatar-policy";

test("network avatar URLs accept normalized HTTPS addresses only", () => {
  assert.equal(
    networkPersonAvatarUrl("https://EXAMPLE.com/avatar.png"),
    "https://example.com/avatar.png",
  );
  assert.equal(networkPersonAvatarUrl(null), null);
  assert.equal(networkPersonAvatarUrl(undefined), null);
  assert.equal(networkPersonAvatarUrl(""), null);
  assert.equal(networkPersonAvatarUrl(" https://example.com/avatar.png"), null);
  assert.equal(networkPersonAvatarUrl("http://example.com/avatar.png"), null);
  assert.equal(
    networkPersonAvatarUrl("https://user:secret@example.com/avatar.png"),
    null,
  );
  assert.equal(networkPersonAvatarUrl("javascript:alert(1)"), null);
  assert.equal(
    networkPersonAvatarUrl(`https://example.com/${"a".repeat(2049)}`),
    null,
  );
});

test("search, following and connection rows render safe network avatars", () => {
  const search = readFileSync(
    new URL("../src/features/search/search-screen.tsx", import.meta.url),
    "utf8",
  );
  const following = readFileSync(
    new URL(
      "../src/features/community/social-following-screen.tsx",
      import.meta.url,
    ),
    "utf8",
  );
  const connections = readFileSync(
    new URL(
      "../src/features/community/social-connections-screen.tsx",
      import.meta.url,
    ),
    "utf8",
  );
  const avatar = readFileSync(
    new URL(
      "../src/features/community/network-person-avatar.tsx",
      import.meta.url,
    ),
    "utf8",
  );

  assert.match(search, /avatarUrl=\{person\.avatarUrl\}/u);
  assert.match(search, /displayName=\{person\.displayName\}/u);
  assert.match(following, /avatarUrl=\{item\.profile\.avatarUrl\}/u);
  assert.match(following, /displayName=\{item\.profile\.displayName\}/u);
  assert.match(connections, /avatarUrl=\{connection\.other\.avatarUrl\}/u);
  assert.match(connections, /displayName=\{connection\.other\.displayName\}/u);
  assert.match(avatar, /networkPersonAvatarUrl\(avatarUrl\)/u);
  assert.match(avatar, /safeAvatarUrl !== failedUri/u);
  assert.match(avatar, /onError=\{\(\) => setFailedUri\(safeAvatarUrl\)\}/u);
});
