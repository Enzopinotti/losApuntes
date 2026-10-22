import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

import { publicProfileShareUrl } from "../src/features/search/public-profile-share";

const screen = readFileSync(
  new URL("../src/features/search/search-result-screens.tsx", import.meta.url),
  "utf8",
);
const shareAction = readFileSync(
  new URL(
    "../src/features/search/share-public-profile-action.tsx",
    import.meta.url,
  ),
  "utf8",
);

const PROFILE_ID = "11111111-1111-4111-8111-111111111111";

test("public profile share links target only the canonical profile route", () => {
  assert.equal(
    publicProfileShareUrl(PROFILE_ID),
    `losapuntes:///profiles/${PROFILE_ID}`,
  );
  assert.equal(
    publicProfileShareUrl("11111111-1111-4111-8111-AAAAAAAAAAAA"),
    "losapuntes:///profiles/11111111-1111-4111-8111-aaaaaaaaaaaa",
  );
});

test("public profile share rejects malformed, duplicated and injected route identities", () => {
  for (const profileId of [
    "",
    "profile-id",
    `${PROFILE_ID}/settings`,
    `${PROFILE_ID}?token=secret`,
    "11111111-1111-5111-8111-111111111111",
    "11111111-1111-4111-7111-111111111111",
  ]) {
    assert.equal(publicProfileShareUrl(profileId), null);
  }
});

test("sharing is an explicit native action with only the deep link as payload", () => {
  assert.match(
    screen,
    /<SharePublicProfileAction profileId=\{profileId\} \/>/u,
  );
  assert.match(shareAction, /Share\.share\(\{ message: url \}\)/u);
  assert.doesNotMatch(shareAction, /credential|sessionToken|email/u);
});
