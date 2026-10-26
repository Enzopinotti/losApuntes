import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";

const page = await readFile(
  path.join(process.cwd(), "apps/web/src/pages/PublicProfile.tsx"),
  "utf8",
);
const action = await readFile(
  path.join(
    process.cwd(),
    "apps/web/src/features/profile/public-profile-share-action.tsx",
  ),
  "utf8",
);
assert.match(page, /PublicProfileShareAction/u);
assert.match(page, /profile\.about\?\.displayName && \(/u);
assert.match(
  action,
  /publicProfileShareUrl\(profileId, window\.location\.origin\)/u,
);
assert.match(action, /navigator\.share/u);
assert.match(action, /navigator\.clipboard/u);
assert.match(action, /role=\{failed \? "alert" : "status"\}/u);

console.log("PASS Web public profile sharing UI contract");
