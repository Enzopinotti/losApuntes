import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

function file(path: string): string {
  return readFileSync(new URL(path, import.meta.url), "utf8");
}

test("collection rows share only an authorized, matching resource projection", () => {
  const screen = file(
    "../src/features/study-collections/study-collections-screen.tsx",
  );
  const rows = screen.slice(
    screen.indexOf("{currentDetail.items.map((item) => ("),
    screen.indexOf(
      "{currentDetail.nextCursor ?",
      screen.indexOf("{currentDetail.items.map((item) => ("),
    ),
  );

  assert.match(screen, /detailState\?\.authorityKey === authorityKey/u);
  assert.match(screen, /!MOBILE_PERSISTENT_COLLECTIONS_VISIBLE/u);
  assert.match(
    rows,
    /item\.resource && item\.resource\.id === item\.resourceId/u,
  );
  assert.match(rows, /<MobileResourceShareAction\b/u);
  assert.match(rows, /resourceId=\{item\.resource\.id\}/u);
  assert.match(rows, /resourceTitle=\{item\.resource\.title\}/u);
  assert.match(rows, /Apunte no disponible o sin permiso/u);
});

test("collection sharing keeps opening and removal as separate row actions", () => {
  const screen = file(
    "../src/features/study-collections/study-collections-screen.tsx",
  );
  const rows = screen.slice(
    screen.indexOf("{currentDetail.items.map((item) => ("),
    screen.indexOf(
      "{currentDetail.nextCursor ?",
      screen.indexOf("{currentDetail.items.map((item) => ("),
    ),
  );

  assert.match(rows, /accessibilityRole="link"/u);
  assert.match(rows, /resourceActions/u);
  assert.match(rows, /onPress=\{\(\) => removeResource\(item\.resourceId\)\}/u);
});
