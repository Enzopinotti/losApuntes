import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const screen = readFileSync(
  new URL("../src/features/organizations/organization-detail-screen.tsx", import.meta.url),
  "utf8",
);

test("organization detail wires native event share without changing follow authority", () => {
  assert.match(screen, /mobileOrganizationEventShareMessage\(event\)/u);
  assert.match(screen, /await Share\.share\(\{ message \}\)/u);
  assert.match(screen, /accessibilityLabel=\{\`Compartir enlace del evento/u);
  assert.match(screen, /disabled=\{shareBusy\}/u);
  assert.match(screen, /eventShareGeneration\.current/u);
  assert.match(screen, /shareStatus === "failure"/u);
  assert.match(screen, /controller\.toggleFollow\(authorityKey, organizationId\)/u);
  assert.match(screen, /controller\.loadMoreEvents\(authorityKey, organizationId\)/u);
});
