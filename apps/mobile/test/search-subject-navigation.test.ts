import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  subjectResourcesSearchAction,
  subjectResourcesSearchRouteId,
} from "../src/features/search/search-subject-navigation";
import {
  initialSearchInputState,
  searchInputReducer,
} from "../src/features/search/search-input-state";
import { parseMobileSearchLink } from "../src/features/search/search-deep-link";

const id = "11111111-1111-4111-8111-111111111111";
const otherId = "22222222-2222-4222-8222-222222222222";

function screen(path: string) {
  return readFileSync(new URL(path, import.meta.url), "utf8");
}

test("Subject explore route contains only a canonical validated UUID, no title or secret", () => {
  const action = subjectResourcesSearchAction({
    subjectId: id.toUpperCase(),
    subjectName: " Análisis Matemático ",
  });
  assert.deepEqual(action?.href, {
    pathname: "/(tabs)/search",
    params: { subjectId: id },
  });
  assert.equal(
    action?.accessibilityLabel,
    "Explorar apuntes de Análisis Matemático",
  );
  assert.match(action?.accessibilityHint ?? "", /permisos.*servidor/u);
  assert.equal(JSON.stringify(action?.href).includes("Análisis"), false);
  assert.equal(JSON.stringify(action?.href).includes("credential"), false);
  assert.equal(subjectResourcesSearchRouteId(id.toUpperCase()), id);
});

test("external Subject route rejects arrays, malformed UUIDs, paths, and noncanonical variants", () => {
  for (const bad of [
    undefined,
    "",
    "not-an-id",
    "../admin",
    "00000000-0000-0000-0000-000000000000",
    "11111111-1111-4111-8111-111111111111?q=secret",
    " 11111111-1111-4111-8111-111111111111 ",
    [id],
    [id, otherId],
    "/questions/subjects/" + id,
  ]) {
    assert.equal(subjectResourcesSearchRouteId(bad), null);
  }
  for (const bad of [
    "not-an-id",
    "../admin",
    "00000000-0000-0000-0000-000000000000",
  ]) {
    assert.equal(subjectResourcesSearchAction({ subjectId: bad }), null);
  }
});

test("labels are display-only and bounded; route payload cannot gain a fake academic authority", () => {
  const longLabel = "Materias ".repeat(80);
  const action = subjectResourcesSearchAction({
    subjectId: id,
    subjectName: longLabel,
  });
  assert.ok(
    (action?.accessibilityLabel.length ?? Infinity) <=
      "Explorar apuntes de ".length + 80,
  );
  assert.deepEqual(action?.href, {
    pathname: "/(tabs)/search",
    params: { subjectId: id },
  });
  assert.equal(
    subjectResourcesSearchAction({ subjectId: id })?.accessibilityLabel,
    "Explorar apuntes de esta materia",
  );
});

test("inbound Subject selection uses the existing subject-only server search without text", () => {
  const state = searchInputReducer(initialSearchInputState, {
    type: "subjectSelected",
    subject: { id, name: "esta materia" },
  });
  assert.equal(state.query, "");
  assert.equal(state.scope, "resources");
  assert.deepEqual(state.selectedSubject, { id, name: "esta materia" });

  // The controller receives { scope:'resources', subjectId } with no q.
  // Text searches still use the existing minimum-two-character policy.
  const searchScreen = screen("../src/features/search/search-screen.tsx");
  const searchInput = screen("../src/features/search/search-input-state.ts");
  assert.match(searchInput, /state\.scope === "resources" &&/u);
  assert.match(searchInput, /return \{ scope: "resources", subjectId \};/u);
  assert.match(searchScreen, /searchInputForState\(searchInputState\)/u);
  assert.match(
    searchScreen,
    /controller\.scheduleSearch\(authorityKey, searchInput\)/u,
  );
  assert.match(searchScreen, /mobileSearchApi/u);
  assert.match(searchScreen, /academicMatchesSession/u);
});

test("manual edits and clearing a routed filter do not restore a stale Subject", () => {
  const selected = searchInputReducer(initialSearchInputState, {
    type: "subjectSelected",
    subject: { id, name: "esta materia" },
  });
  const typed = searchInputReducer(selected, {
    type: "queryChanged",
    query: "álgebra",
  });
  assert.deepEqual(typed.selectedSubject, { id, name: "esta materia" });
  assert.equal(typed.query, "álgebra");
  const cleared = searchInputReducer(selected, {
    type: "subjectFilterCleared",
  });
  assert.deepEqual(cleared, initialSearchInputState);
  const switched = searchInputReducer(selected, {
    type: "subjectSelected",
    subject: { id: otherId, name: "Física" },
  });
  assert.equal(switched.selectedSubject?.id, otherId);

  const searchScreen = screen("../src/features/search/search-screen.tsx");
  assert.match(searchScreen, /handledIncomingSearch\.current === key/u);
  assert.match(searchScreen, /sessionAuthority/u);
  assert.match(searchScreen, /hasIncomingSearchParams && !incomingSearch/u);
  assert.deepEqual(parseMobileSearchLink({ subjectId: id }), {
    scope: "resources",
    subjectId: id,
  });
  assert.equal(parseMobileSearchLink({ subjectId: "invalid" }), null);
  assert.match(searchScreen, /controller\.cancelSearch\(\);/u);
  assert.match(searchScreen, /subjectFilterCleared/u);
});

test("all entry points reuse the same canonical exploration action without inventing content", () => {
  const detail = screen(
    "../src/features/resources/resource-related-session-panel.tsx",
  );
  const home = screen("../src/features/home/home-recent-opened-card.tsx");
  const saved = screen("../src/features/resources/saved-resources-screen.tsx");
  const search = screen("../src/features/search/search-screen.tsx");

  assert.match(detail, /subjectResourcesSearchAction\(\{[\s\S]*?subjectId,/u);
  assert.match(detail, /Explorar otros apuntes de esta materia/u);
  assert.match(home, /subjectResourcesSearchAction\(\{/u);
  assert.match(home, /Explorar apuntes de mi materia/u);
  assert.match(saved, /subjectResourcesSearchAction\(\{/u);
  assert.match(saved, /Explorar más apuntes de esta materia/u);

  assert.match(search, /useLocalSearchParams/u);
  assert.match(search, /parseMobileSearchLink/u);
  assert.match(search, /subjectId: routeParams\.subjectId/u);
  const parser = screen("../src/features/search/search-deep-link.ts");
  assert.match(parser, /subjectResourcesSearchRouteId\(params\.subjectId\)/u);
  assert.match(search, /onExploreSubject=\{exploreContextSubject\}/u);
  assert.match(search, /Explorar apuntes de esta materia/u);
  assert.match(search, /Este enlace de búsqueda o su filtro de materia no es válido/u);
});

test("subject exploration does not change existing Q&A route or grant publication", () => {
  const detail = screen(
    "../src/features/resources/resource-related-session-panel.tsx",
  );
  const home = screen("../src/features/home/home-recent-opened-card.tsx");
  assert.match(detail, /savedSubjectQuestionsAction\(currentResource\)/u);
  assert.match(detail, /router\.push\(questionsAction\.href\)/u);
  assert.match(home, /Preguntas de mi materia/u);
  assert.match(detail, /router\.push\(exploreAction\.href\)/u);
  assert.match(home, /router\.push\(exploreCurrentSubject\.href\)/u);
});

test("filtered Search respects the existing eight-resource response bound", () => {
  const searchApi = screen("../src/features/search/search-api.ts");
  assert.match(
    searchApi,
    /this\.transport\.search\(credential, \{ \.\.\.input, limit: 8 \}, signal\)/u,
  );
  const search = screen("../src/features/search/search-screen.tsx");
  assert.match(search, /Mostramos hasta ocho resultados de cada tipo/u);
});
