import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

function file(path: string): string {
  return readFileSync(new URL(path, import.meta.url), "utf8");
}

test("Saved Resources offers safe sharing on rows loaded for current authority", () => {
  const screen = file("../src/features/resources/saved-resources-screen.tsx");
  const row = screen.slice(
    screen.indexOf("function SavedResourceRow("),
    screen.indexOf("export function SavedResourcesScreen"),
  );

  assert.match(screen, /snapshot\.authorityKey === authorityKey/u);
  assert.match(row, /<MobileResourceShareAction\b/u);
  assert.match(row, /resourceId=\{resource\.id\}/u);
  assert.match(row, /resourceTitle=\{resource\.title\}/u);
  assert.match(row, /Quitar.*de guardados/u);
});

test("Owned Resources offers safe sharing beside the authorized detail action", () => {
  const screen = file("../src/features/resources/owned-resources-screen.tsx");
  const row = screen.slice(
    screen.indexOf("function OwnedResourceRow("),
    screen.indexOf("export function OwnedResourcesScreen"),
  );

  assert.match(screen, /snapshot\.authorityKey === authorityKey/u);
  assert.match(screen, /controller\.load\(authorityKey/u);
  assert.match(row, /<MobileResourceShareAction\b/u);
  assert.match(row, /resourceId=\{resource\.id\}/u);
  assert.match(row, /resourceTitle=\{resource\.title\}/u);
  assert.match(row, /Abrir y administrar/u);
});
