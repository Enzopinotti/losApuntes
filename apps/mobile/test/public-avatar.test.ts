import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { publicAvatarUrl } from "../src/features/profile/public-avatar-policy";

test("public avatar URLs accept normalized HTTPS addresses only", () => {
  assert.equal(
    publicAvatarUrl("https://EXAMPLE.com/avatar.png"),
    "https://example.com/avatar.png",
  );
  assert.equal(publicAvatarUrl(null), null);
  assert.equal(publicAvatarUrl(undefined), null);
  assert.equal(publicAvatarUrl(""), null);
  assert.equal(publicAvatarUrl(" https://example.com/avatar.png"), null);
  assert.equal(publicAvatarUrl("http://example.com/avatar.png"), null);
  assert.equal(
    publicAvatarUrl("https://user:secret@example.com/avatar.png"),
    null,
  );
  assert.equal(publicAvatarUrl("javascript:alert(1)"), null);
  assert.equal(
    publicAvatarUrl(`https://example.com/${"a".repeat(2049)}`),
    null,
  );
});

test("search, following, connections and Home use the shared safe avatar", () => {
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
    new URL("../src/features/profile/public-avatar.tsx", import.meta.url),
    "utf8",
  );
  const home = readFileSync(
    new URL("../src/features/home/home-screen.tsx", import.meta.url),
    "utf8",
  );
  assert.match(search, /avatarUrl=\{person\.avatarUrl\}/u);
  assert.match(search, /displayName=\{person\.displayName\}/u);
  assert.match(following, /avatarUrl=\{item\.profile\.avatarUrl\}/u);
  assert.match(following, /displayName=\{item\.profile\.displayName\}/u);
  assert.match(connections, /avatarUrl=\{connection\.other\.avatarUrl\}/u);
  assert.match(connections, /displayName=\{connection\.other\.displayName\}/u);
  assert.match(avatar, /publicAvatarUrl\(avatarUrl\)/u);
  assert.match(avatar, /safeAvatarUrl !== failedUri/u);
  assert.match(avatar, /onError=\{\(\) => setFailedUri\(safeAvatarUrl\)\}/u);
  assert.match(
    home,
    /import \{ PublicAvatar \} from "@\/features\/profile\/public-avatar"/u,
  );
  assert.match(
    home,
    /<PublicAvatar[\s\S]*?avatarUrl=\{avatarUrl\}[\s\S]*?displayName=\{author\}[\s\S]*?size="small"/u,
  );
  assert.doesNotMatch(home, /<Image/u);
});
