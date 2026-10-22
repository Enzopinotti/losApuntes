import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

test("public community and resource author links show the safe avatar", () => {
  const community = readFileSync(
    new URL("../src/features/community/community-screens.tsx", import.meta.url),
    "utf8",
  );
  const search = readFileSync(
    new URL("../src/features/search/search-screen.tsx", import.meta.url),
    "utf8",
  );

  assert.equal(
    community.match(/<CommunityAuthorAttribution /gu)?.length,
    3,
    "Feed questions, question details and answers share one author row",
  );
  assert.match(
    community,
    /if \(!action\) return <Text style=\{styles\.copy\}/u,
  );
  assert.match(community, /avatarUrl=\{author\?\.avatarUrl\}/u);
  assert.match(community, /displayName=\{displayName\}/u);
  assert.match(community, /accessibilityRole="link"/u);
  assert.match(search, /avatarUrl=\{resource\.author\.avatarUrl\}/u);
  assert.match(search, /displayName=\{resource\.author\.displayName\}/u);
  assert.match(
    search,
    /accessibilityLabel=\{authorAction\.accessibilityLabel\}/u,
  );
});
