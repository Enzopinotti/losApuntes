import assert from "node:assert/strict";
import { publicProfileAvatarUrl } from "../apps/web/src/features/profile/public-profile-avatar-policy.ts";

const safeAvatar = "https://cdn.example.test/ada.png";
assert.equal(publicProfileAvatarUrl(safeAvatar), safeAvatar);
assert.equal(publicProfileAvatarUrl(null), null);
assert.equal(publicProfileAvatarUrl(undefined), null);
assert.equal(publicProfileAvatarUrl("http://cdn.example.test/ada.png"), null);
assert.equal(publicProfileAvatarUrl("//cdn.example.test/ada.png"), null);
assert.equal(publicProfileAvatarUrl("javascript:alert(1)"), null);
assert.equal(
  publicProfileAvatarUrl("https://user:secret@cdn.example.test/ada.png"),
  null,
);
assert.equal(
  publicProfileAvatarUrl(`https://cdn.example.test/${"a".repeat(2048)}`),
  null,
);

console.log("PASS Web public profile avatar URL policy");
