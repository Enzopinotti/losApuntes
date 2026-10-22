import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";

const page = await readFile(
  path.join(process.cwd(), "apps/web/src/pages/Profile.tsx"),
  "utf8",
);

assert.match(page, /import \{ ConfirmDialog \} from/u);
assert.match(page, /open=\{activityToDelete !== null\}/u);
assert.match(page, /Se eliminará “\$\{activityToDelete\.title\}”/u);
assert.match(page, /confirmLabel="Eliminar actividad"/u);
assert.match(page, /cancelLabel="Conservar actividad"/u);
assert.match(page, /returnFocusRef=\{deleteActivityFocusRef\}/u);
assert.match(
  page,
  /deleteActivityFocusRef\.current\s*=\s*event\.currentTarget/u,
);
assert.match(page, /void removeActivity\(target\.id\)/u);

console.log("PASS Web profile activity delete confirmation");
