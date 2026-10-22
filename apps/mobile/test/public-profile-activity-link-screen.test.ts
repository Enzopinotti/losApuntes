import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

const screen = readFileSync(
  new URL(
    "../src/features/search/public-profile-activities.tsx",
    import.meta.url,
  ),
  "utf8",
);

test("public activity links open only validated destinations with accessible labels", () => {
  assert.match(screen, /publicProfileActivityExternalUrl\(activity\.url\)/u);
  assert.match(screen, /Linking\.openURL\(url\)/u);
  assert.match(screen, /accessibilityRole="link"/u);
  assert.match(screen, /externalHost/u);
});
