import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";

const service = await readFile(
  path.join(
    process.cwd(),
    "apps/web/src/features/profile/services/profileService.ts",
  ),
  "utf8",
);

assert.match(service, /UpdateProfileActivityInput/u);
assert.match(service, /updateActivity:\s*\(/u);
assert.match(
  service,
  /profile\/me\/activities\/\$\{encodeURIComponent\(activityId\)\}/u,
);
assert.match(service, /method:\s*"PATCH"/u);
assert.match(service, /body:\s*json\(input\)/u);
assert.match(service, /signal,\s*\}\s*,?\s*\),/u);

console.log("PASS Web profile activity update API client");
