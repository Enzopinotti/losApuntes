import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";

const [page, styles] = await Promise.all([
  readFile(path.join(process.cwd(), "apps/web/src/pages/Profile.tsx"), "utf8"),
  readFile(path.join(process.cwd(), "apps/web/src/pages/Profile.scss"), "utf8"),
]);

assert.match(
  page,
  /setSectionOrder\(next\.profile\.presentation\.sectionOrder\)/u,
);
assert.match(
  page,
  /presentation:\s*\{\s*accentPreset,\s*coverPreset,\s*sectionOrder\s*\}/u,
);
assert.match(page, /moveProfileSectionOrder\(current, section\.key, -1\)/u);
assert.match(page, /moveProfileSectionOrder\(current, section\.key, 1\)/u);
assert.match(page, /aria-label=\{`Subir \$\{section\.label\}`\}/u);
assert.match(page, /aria-label=\{`Bajar \$\{section\.label\}`\}/u);
assert.match(page, /index === 0/u);
assert.match(page, /index === sectionOrder\.length - 1/u);
assert.match(page, /className="profile-section-order"/u);
assert.match(styles, /\.profile-section-order li/u);

console.log("PASS Web profile section order editor UI");
