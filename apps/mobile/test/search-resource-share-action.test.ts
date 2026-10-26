import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

function file(path: string): string {
  return readFileSync(new URL(path, import.meta.url), "utf8");
}

test("Search exposes an explicit, permission-neutral resource share action", () => {
  const screen = file("../src/features/search/search-screen.tsx");
  const resultCard = screen.slice(
    screen.indexOf("function ResourceResult("),
    screen.indexOf("function ResourceGroup("),
  );
  const action = file("../src/features/resources/resource-share-action.tsx");

  assert.match(resultCard, /<MobileResourceShareAction\b/u);
  assert.match(action, /Share\.share\(\{ message: payload\.message \}\)/u);
  assert.match(action, /accessibilityRole="button"/u);
  assert.match(action, /accessibilityHint=.*El enlace no concede acceso/u);
  assert.match(action, /minHeight: 44/u);
});

test("resource share does not use signed file URLs or add authorization fields", () => {
  const share = file("../src/features/resources/resource-share-link.ts");
  assert.match(share, /losapuntes:\/\/\/resources\//u);
  assert.match(share, /RESOURCE_UUID_V4\.test\(resource\.id\)/u);
  assert.doesNotMatch(share, /resource\.file|signature|session|token|grant/iu);
});
