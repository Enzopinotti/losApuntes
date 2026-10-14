import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

import { resourceAuthorAction } from "../src/features/resources/resource-details-copy";

const searchScreen = readFileSync(
  new URL("../src/features/search/search-screen.tsx", import.meta.url),
  "utf8",
);
const resourceResultStart = searchScreen.indexOf("function ResourceResult(");
const resourceGroupStart = searchScreen.indexOf("function ResourceGroup(");
const resourceResult = searchScreen.slice(
  resourceResultStart,
  resourceGroupStart,
);

test("Mobile Search author actions use the current public profile identity", () => {
  assert.deepEqual(
    resourceAuthorAction({
      profileId: "profile-123",
      displayName: "Ana Pérez",
      avatarUrl: null,
    }),
    {
      profileId: "profile-123",
      accessibilityLabel: "Ver perfil de Ana Pérez",
      accessibilityHint:
        "Abre el perfil público y vuelve a comprobar los permisos actuales.",
    },
  );
  assert.equal(
    resourceAuthorAction({
      profileId: " profile-123 ",
      displayName: "Ana Pérez",
      avatarUrl: null,
    }),
    null,
  );
  assert.equal(resourceAuthorAction(null), null);
});

test("Search resource content and author use separate accessible actions", () => {
  assert.notEqual(resourceResultStart, -1);
  assert.ok(resourceGroupStart > resourceResultStart);
  assert.match(resourceResult, /<View style=\{styles\.resultRow\}>/u);
  assert.match(resourceResult, /resourceAuthorAction\(resource\.author\)/u);
  assert.match(
    resourceResult,
    /accessibilityLabel=\{authorAction\.accessibilityLabel\}/u,
  );
  assert.match(
    resourceResult,
    /accessibilityHint=\{authorAction\.accessibilityHint\}/u,
  );
  assert.match(
    resourceResult,
    /onPress=\{\(\) => onOpenProfile\(authorAction\.profileId\)\}/u,
  );
  assert.match(resourceResult, /authorAction\s*\?/u);
  assert.match(resourceResult, /styles\.resourceAuthorAction/u);
  assert.match(resourceResult, /styles\.resourceAuthorLabel/u);
  assert.ok(
    (resourceResult.match(/<Pressable/gu) ?? []).length >= 3,
    "opening a resource, its author and quick-save are independent actions",
  );
  assert.match(resourceResult, /onPress=\{onPress\}/u);
  assert.match(resourceResult, /onPress=\{onQuickSave\}/u);
  assert.match(searchScreen, /pathname: "\/profiles\/\[profileId\]"/u);
  assert.equal(
    (searchScreen.match(/onOpenProfile=\{openPerson\}/gu) ?? []).length,
    2,
    "search results and contextual discovery both expose public profile navigation",
  );
});
