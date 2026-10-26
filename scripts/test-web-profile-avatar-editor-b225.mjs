import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";

const page = await readFile(
  path.join(process.cwd(), "apps/web/src/pages/Profile.tsx"),
  "utf8",
);

assert.match(page, /setAvatarUrl\(next\.profile\.avatarUrl \?\? ""\)/u);
assert.match(page, /avatarUrl: avatarUrl\.trim\(\) \|\| null/u);
assert.match(page, /id="profile-avatar-url"/u);
assert.match(page, /htmlFor="profile-avatar-url"/u);
assert.match(page, /type="url"/u);
assert.match(page, /pattern="https:\/\/\.\+"/u);
assert.match(page, /maxLength=\{2048\}/u);
assert.match(page, /Dejalo vacío para quitar el avatar/u);

console.log("PASS Web profile avatar editor contract");
