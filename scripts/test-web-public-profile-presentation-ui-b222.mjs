import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";

const [page, styles] = await Promise.all([
  readFile(
    path.join(process.cwd(), "apps/web/src/pages/PublicProfile.tsx"),
    "utf8",
  ),
  readFile(path.join(process.cwd(), "apps/web/src/pages/Profile.scss"), "utf8"),
]);

assert.match(page, /publicProfilePresentationPresets\(/u);
assert.match(page, /data-accent=\{presentationPresets\.accentPreset\}/u);
assert.match(page, /data-cover=\{presentationPresets\.coverPreset\}/u);
assert.match(styles, /\.public-profile \{\s*--public-profile-accent:/u);
for (const accent of ["indigo", "emerald", "amber", "rose", "slate"]) {
  assert.match(styles, new RegExp(`data-accent="${accent}"`, "u"));
}
for (const cover of ["gradient", "paper", "campus"]) {
  assert.match(styles, new RegExp(`data-cover="${cover}"`, "u"));
}

console.log("PASS public profile presentation UI contract");
