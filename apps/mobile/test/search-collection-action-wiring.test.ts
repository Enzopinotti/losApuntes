import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

function file(path: string): string {
  return readFileSync(new URL(path, import.meta.url), "utf8");
}

test("Search exposes a gated collection action on query and contextual resources", () => {
  const screen = file("../src/features/search/search-screen.tsx");
  const resultCard = screen.slice(
    screen.indexOf("function ResourceResult("),
    screen.indexOf("function ResourceGroup("),
  );

  assert.match(screen, /MOBILE_PERSISTENT_COLLECTIONS_VISIBLE/u);
  assert.match(resultCard, /Agregar \$\{resource\.title\} a una colección/u);
  assert.match(resultCard, /No cambia los permisos del apunte/u);
  assert.match(screen, /onAddToCollection=\{openCollectionPicker\}/gu);
  assert.equal(
    screen.match(
      /onAddToCollection=\{\(\) => onAddToCollection\(resource\)\}/gu,
    )?.length,
    2,
  );
});

test("Search uses one session-scoped picker and clears it on authority or filter changes", () => {
  const screen = file("../src/features/search/search-screen.tsx");
  assert.equal(screen.match(/<ResourceCollectionSaveAction\b/gu)?.length, 1);
  assert.match(screen, /visible=\{Boolean\(/u);
  assert.match(screen, /currentCollectionResource && collectionActionVisible/u);
  assert.match(screen, /autoOpen\s+hideToggle/u);
  assert.match(screen, /\[authorityKey, query, scope, subjectId\]/u);
  assert.match(screen, /scopeKey: collectionPickerScopeKey/u);
  assert.match(
    screen,
    /collectionResource\?\.scopeKey === collectionPickerScopeKey/u,
  );
});

test("the existing detail picker remains available behind the same build flag", () => {
  const action = file(
    "../src/features/study-collections/resource-collection-save-action.tsx",
  );
  const details = file("../src/features/resources/resource-details-screen.tsx");

  assert.match(action, /MOBILE_PERSISTENT_COLLECTIONS_VISIBLE/u);
  assert.match(action, /if \(!autoOpen \|\| !authorityKey/u);
  assert.match(details, /<ResourceCollectionSaveAction/u);
});
