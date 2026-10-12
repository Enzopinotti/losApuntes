import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

function file(path: string): string {
  return readFileSync(new URL(path, import.meta.url), "utf8");
}

test("owner library is a standalone route reachable from Profile", () => {
  const route = file("../src/app/my-resources.tsx");
  const profile = file("../src/features/profile/profile-screen.tsx");
  assert.match(route, /OwnedResourcesScreen/u);
  assert.match(profile, /href="\/my-resources"/u);
  assert.match(profile, /Mis apuntes/u);
  assert.match(profile, /href="\/saved-resources"/u);
});

test("owner library remains distinct from saved resources and public search", () => {
  const screen = file("../src/features/resources/owned-resources-screen.tsx");
  const api = file("../src/features/resources/resource-owned-api.ts");
  assert.match(screen, /title="Mis apuntes"/u);
  assert.match(screen, /mobileOwnedResourcesApi/u);
  assert.match(screen, /resourceVisibilityLabel\(resource.visibility\)/u);
  assert.match(screen, /pathname: "\/resources\/\[id\]"/u);
  assert.match(api, /\/resources\/mine\?/u);
  assert.match(api, /isCredentialAuthoritative/u);
  assert.doesNotMatch(api, /\/resources\/saved/u);
});

test("filters and next-page controls use the API rather than local-only filtering", () => {
  const screen = file("../src/features/resources/owned-resources-screen.tsx");
  const controller = file(
    "../src/features/resources/resource-owned-controller.ts",
  );
  assert.match(screen, /accessibilityRole="radiogroup"/u);
  assert.match(screen, /setVisibility\(option.value\)/u);
  assert.match(screen, /controller.load\(authorityKey, visibility,/u);
  assert.match(screen, /controller.loadMore\(authorityKey\)/u);
  assert.match(controller, /this.api.listOwned\(/u);
  assert.match(controller, /appendUnique\(/u);
  assert.match(controller, /this\.active\?\.controller\.abort\(\)/u);
  assert.match(controller, /latest.filters !== operation.filters/u);
});

test("owner endpoint uses verified identity and authorization before projection", () => {
  const routes = file(
    "../../api/src/resources/resources.controller.ts",
  );
  const store = file(
    "../../api/src/resources/mongo/mongo-resource.store.ts",
  );
  assert.match(routes, /@Get\('mine'\)/u);
  assert.match(routes, /@Header\('Cache-Control', 'private, no-store'\)/u);
  assert.match(store, /authorUserId: input.authorUserId/u);
  assert.match(store, /moderationState: 'available'/u);
  assert.match(store, /input.subjectId/u);
  assert.match(store, /searchText:/u);
  assert.match(store, /input.order === 'oldest'/u);
});

test("owner search, subjects, chronological order and reset are server-backed", () => {
  const screen = file("../src/features/resources/owned-resources-screen.tsx");
  const controller = file("../src/features/resources/resource-owned-controller.ts");
  const api = file("../src/features/resources/resource-owned-api.ts");
  assert.match(screen, /Buscar en todas mis publicaciones/u);
  assert.match(screen, /onSubmitEditing/u);
  assert.match(screen, /setQuery\(normalizedDraft\)/u);
  assert.match(screen, /listSubjects\(active.signal\)/u);
  assert.match(screen, /setSubjectId\(subject.subjectId\)/u);
  assert.match(screen, /setOrder\(choice.value\)/u);
  assert.match(screen, /Limpiar filtros/u);
  assert.match(screen, /subjectResults.data.truncated/u);
  assert.match(controller, /serverQuery\(current.filters\)/u);
  assert.match(api, /query.set\("subjectId"/u);
  assert.match(api, /query.set\("order"/u);
  assert.match(api, /query.set\("q"/u);
});
