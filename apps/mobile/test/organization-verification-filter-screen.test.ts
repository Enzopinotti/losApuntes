import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

const screen = readFileSync(
  new URL(
    "../src/features/organizations/organizations-directory-screen.tsx",
    import.meta.url,
  ),
  "utf8",
);

test("Mobile verification selector stays session scoped and accessible", () => {
  assert.match(screen, /verificationState \?\? "all-verifications"/u);
  assert.match(screen, /verificationFilters\.map/u);
  assert.match(screen, /accessibilityRole="radiogroup"/u);
  assert.match(screen, /accessibilityState=\{\{ checked: selected \}\}/u);
  assert.match(screen, /setVerificationState\(option\.value\)/u);
  assert.match(screen, /verificationState \? \{ verificationState \} : \{\}/u);
  assert.match(screen, /Filtrar por institución/u);
  assert.match(screen, /<PublicAvatar/u);
});
