import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";

const [page, styles] = await Promise.all([
  readFile(path.join(process.cwd(), "apps/web/src/pages/Profile.tsx"), "utf8"),
  readFile(path.join(process.cwd(), "apps/web/src/pages/Profile.scss"), "utf8"),
]);

assert.match(page, /profileApi\.updateActivity\(/u);
assert.match(page, /expectedRevision: target\.expectedRevision/u);
assert.match(
  page,
  /setActivityEditDraft\(\{[\s\S]*?expectedRevision: item\.revision/u,
);
assert.match(
  page,
  /profileApi\.createActivity\([\s\S]*?url: activityUrl\.trim\(\) \|\| null/u,
);
assert.match(page, /url: target\.url\.trim\(\) \|\| null/u);
assert.match(page, /PROFILE_ACTIVITY_REVISION_CONFLICT/u);
assert.match(page, /Actividad actualizada\./u);
assert.match(page, /className="profile-activity-edit-form"/u);
assert.match(page, /publicProfileActivityLink\(item\.url\)/u);
assert.match(page, /rel="noopener noreferrer"/u);
assert.match(page, /pattern="https:\/\/\.\+"/u);
assert.match(styles, /\.profile-activity-edit-form/u);

console.log("PASS Web profile activity editor");
