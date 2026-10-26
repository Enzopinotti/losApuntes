import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

function file(path: string): string {
  return readFileSync(new URL(path, import.meta.url), "utf8");
}

test("organization featured resources offer safe sharing under the active authority", () => {
  const screen = file(
    "../src/features/organizations/organization-detail-screen.tsx",
  );
  const start = screen.indexOf(
    "current.organization.featuredResources.map((resource) => (",
  );
  const end = screen.indexOf("current.organization.posts.map", start);
  const rows = screen.slice(start, end);

  assert.match(screen, /snapshot\.authorityKey === authorityKey/u);
  assert.match(screen, /isFocused && appState === "active"/u);
  assert.match(rows, /<MobileResourceShareAction\b/u);
  assert.match(rows, /resourceId=\{resource\.id\}/u);
  assert.match(rows, /resourceTitle=\{resource\.title\}/u);
});

test("organization resource opening and sharing stay as sibling actions", () => {
  const screen = file(
    "../src/features/organizations/organization-detail-screen.tsx",
  );
  const start = screen.indexOf(
    "current.organization.featuredResources.map((resource) => (",
  );
  const end = screen.indexOf("current.organization.posts.map", start);
  const rows = screen.slice(start, end);

  assert.match(rows, /<View key=\{resource\.id\} style=\{styles\.item\}>/u);
  assert.match(rows, /accessibilityLabel=\{`Abrir recurso destacado/u);
  assert.match(rows, /<MobileResourceShareAction\b/u);
});
