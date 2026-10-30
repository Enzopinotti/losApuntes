import assert from "node:assert/strict";
import test from "node:test";

import {
  publicProfileAvatarInitial,
  publicProfileAvatarUri,
} from "../src/features/search/public-profile-avatar-policy";

test("public profile avatar accepts only bounded HTTPS image URLs without credentials", () => {
  assert.equal(
    publicProfileAvatarUri("https://images.example.test/avatar.png"),
    "https://images.example.test/avatar.png",
  );
  assert.equal(
    publicProfileAvatarUri("http://images.example.test/a.png"),
    null,
  );
  assert.equal(publicProfileAvatarUri("data:image/png;base64,abcd"), null);
  assert.equal(
    publicProfileAvatarUri("https://user:secret@images.example.test/a.png"),
    null,
  );
  assert.equal(
    publicProfileAvatarUri(`https://${"a".repeat(2040)}.test/a`),
    null,
  );
  assert.equal(publicProfileAvatarUri(null), null);
});

test("avatar fallback uses the first visible character and handles blank names", () => {
  assert.equal(publicProfileAvatarInitial("  ana pérez  "), "A");
  assert.equal(publicProfileAvatarInitial("Érica"), "É");
  assert.equal(publicProfileAvatarInitial("   "), "·");
});
