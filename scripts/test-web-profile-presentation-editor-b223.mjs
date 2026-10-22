import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";

const page = await readFile(
  path.join(process.cwd(), "apps/web/src/pages/Profile.tsx"),
  "utf8",
);

assert.match(
  page,
  /setAccentPreset\(next\.profile\.presentation\.accentPreset\)/u,
);
assert.match(
  page,
  /setCoverPreset\(next\.profile\.presentation\.coverPreset\)/u,
);
assert.match(
  page,
  /presentation:\s*\{\s*accentPreset,\s*coverPreset,\s*sectionOrder\s*\}/u,
);
assert.match(page, /id="profile-accent-preset"/u);
assert.match(page, /id="profile-cover-preset"/u);
assert.match(page, /htmlFor="profile-accent-preset"/u);
assert.match(page, /htmlFor="profile-cover-preset"/u);
assert.match(page, /accentPresetOptions\.map/u);
assert.match(page, /coverPresetOptions\.map/u);
assert.match(page, /no cambian su\s+privacidad/u);

console.log("PASS Web profile presentation editor");
