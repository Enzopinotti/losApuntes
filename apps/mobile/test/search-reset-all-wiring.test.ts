import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const screen = readFileSync(
  new URL("../src/features/search/search-screen.tsx", import.meta.url),
  "utf8",
);

test("full reset cancels active query and clears reducer before revisiting plain Search", () => {
  const start = screen.indexOf("const resetAllFilters = useCallback(");
  const end = screen.indexOf("const quickSaveResource = useCallback(", start);
  assert.ok(start >= 0 && end > start);
  const handler = screen.slice(start, end);
  assert.match(
    handler,
    /clearSearch\(\);\s*dispatchSearchInput\(\{ type: "resetAll" \}\)/u,
  );
  assert.match(handler, /routeParams\.subjectId !== undefined/u);
  assert.match(handler, /router\.replace\("\/\(tabs\)\/search"\)/u);
  assert.match(screen, /controller\.cancelSearch\(\)/u);
});

test("separate actions distinguish clearing only text from resetting all filters", () => {
  assert.match(screen, /accessibilityLabel="Limpiar texto de búsqueda"/u);
  assert.match(screen, /onPress=\{\(\) => setQueryText\(""\)\}/u);
  assert.match(screen, /accessibilityLabel="Restablecer búsqueda y filtros"/u);
  assert.match(screen, /onPress=\{resetAllFilters\}/u);
  assert.match(
    screen,
    /query\.length > 0 \|\| scope !== "all" \|\| selectedSubject \?/u,
  );
});

test("reset retains contextual discovery and uses the existing authority fence", () => {
  assert.match(screen, /controller\.loadContextual\(authorityKey\)/u);
  assert.match(screen, /controller\.invalidate\(authorityKey\)/u);
  assert.match(screen, /const currentSearch =/u);
  assert.doesNotMatch(screen, /localStorage|AsyncStorage|sessionStorage/u);
});

test("removing a shared search route allows the same link to be opened again", () => {
  assert.match(
    screen,
    /if \(!hasIncomingSearchParams\) \{\s*handledIncomingSearch\.current = null;\s*return;\s*\}/u,
  );
});
