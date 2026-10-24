import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

function file(path: string): string {
  return readFileSync(new URL(path, import.meta.url), "utf8");
}

test("owner statistics share only resources in the current authorized snapshot", () => {
  const screen = file(
    "../src/features/resources/resource-owner-stats-screen.tsx",
  );
  const start = screen.indexOf("data.topResources.map((resource, index) => (");
  const end = screen.indexOf("styles.disclaimer", start);
  const rows = screen.slice(start, end);

  assert.match(screen, /snapshot\.authorityKey === authorityKey/u);
  assert.match(screen, /focused && appState === "active"/u);
  assert.match(rows, /<MobileResourceShareAction\b/u);
  assert.match(rows, /resourceId=\{resource\.id\}/u);
  assert.match(rows, /resourceTitle=\{resource\.title\}/u);
});

test("statistics rows preserve opening and sharing as separate actions", () => {
  const screen = file(
    "../src/features/resources/resource-owner-stats-screen.tsx",
  );
  const start = screen.indexOf("data.topResources.map((resource, index) => (");
  const end = screen.indexOf("styles.disclaimer", start);
  const rows = screen.slice(start, end);

  assert.match(
    rows,
    /<View key=\{resource\.id\} style=\{styles\.rankingRow\}>/u,
  );
  assert.match(rows, /onPress=\{\(\) => onOpen\(resource\.id\)\}/u);
  assert.match(rows, /<MobileResourceShareAction\b/u);
  assert.match(rows, />Abrir apunte<\/Text>/u);
});
