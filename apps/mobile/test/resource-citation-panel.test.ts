import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { buildMobileResourceCitation } from "../src/features/resources/resource-citation";

test("resource details expose an explicit citation preview and native share action", () => {
  const panel = readFileSync(
    new URL(
      "../src/features/resources/resource-citation-panel.tsx",
      import.meta.url,
    ),
    "utf8",
  );
  const screen = readFileSync(
    new URL(
      "../src/features/resources/resource-details-screen.tsx",
      import.meta.url,
    ),
    "utf8",
  );

  assert.match(panel, /accessibilityState=\{\{ expanded \}\}/u);
  assert.match(panel, /Share\.share\(\{ message: citation \}\)/u);
  assert.match(panel, /No incluye un enlace ni cambia quién tiene permiso/u);
  assert.match(
    screen,
    /<MobileResourceCitationPanel\s+key=\{resource\.id\}\s+resource=\{resource\}/u,
  );
});

test("citation content is not exposed for an invalid resource identifier", () => {
  assert.equal(
    buildMobileResourceCitation({
      id: "bad-id",
    } as Parameters<typeof buildMobileResourceCitation>[0]),
    null,
  );
});
