import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

const screen = readFileSync(
  new URL(
    "../src/features/organizations/organization-detail-screen.tsx",
    import.meta.url,
  ),
  "utf8",
);

test("organization sharing requires a canonical public link and explicit action", () => {
  assert.match(
    screen,
    /mobileOrganizationPublicLink\(current\.organization\.id\)/u,
  );
  assert.ok(screen.includes("accessibilityLabel={`Compartir "));
  assert.match(screen, /Share\.share\(\{ message:/u);
  assert.match(screen, /setShareError\(/u);
  assert.doesNotMatch(
    screen,
    /Share\.share\(\{ message:\s*(?:session|credential|token)/u,
  );
});
