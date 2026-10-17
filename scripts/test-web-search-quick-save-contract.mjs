import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";

import { searchSaveFailure } from "../apps/web/src/features/search/search-save-outcome.mjs";
import {
  searchReturnHref,
  searchSelectionHref,
} from "../apps/web/src/features/search/search-navigation.mjs";

const root = process.cwd();
const read = (file) => readFile(path.join(root, file), "utf8");

for (const status of [null, 0, 500, 503, 504]) {
  assert.deepEqual(
    searchSaveFailure(status),
    { kind: "uncertain" },
    "Network and 5xx write results must not claim completion or permit blind retry",
  );
}
for (const status of [400, 401, 403, 404, 409, 422]) {
  assert.equal(searchSaveFailure(status).kind, "error");
}
assert.match(searchSaveFailure(401).message, /sesión/u);
assert.match(searchSaveFailure(403).message, /no está disponible/u);

const service = await read("apps/web/src/features/resources/services/resourcesService.ts");
assert.match(service, /save: \(resourceId: string, signal\?: AbortSignal\)/u);
assert.match(service, /\x60\/resources\/\$\{encodeURIComponent\(resourceId\)\}\/save\x60/u);
assert.match(service, /method: "PUT"/u);
assert.match(service, /credentials: "include"/u);
assert.match(service, /cache: "no-store"/u);

const action = await read("apps/web/src/features/search/SearchQuickSaveAction.tsx");
assert.match(action, /useAsyncAuthorityFence\(scopeKey\)/u);
assert.match(action, /search-save:\$\{authorityScope\}:\$\{resourceId\}/u);
assert.match(action, /resourcesApi\.save\(resourceId, ticket\.signal\)/u);
assert.match(action, /isCurrent\(ticket\)/u);
assert.match(action, /result\.saved === true/u);
assert.match(action, /searchSaveFailure/u);
assert.match(action, /current\?\.kind === "uncertain"/u);
assert.match(action, /disabled=\{current\?\.kind === "saving"\}/u);
assert.match(action, /role="alert"/u);
assert.match(action, /Ver mis guardados/u);
assert.match(action, /Revisar guardados/u);
assert.doesNotMatch(action, /localStorage|sessionStorage/u);
assert.doesNotMatch(action, /unsave\(/u);

const page = await read("apps/web/src/pages/Search.tsx");
assert.match(page, /<SearchQuickSaveAction/u);
assert.match(page, /resourceId=\{resource\.id\}/u);
assert.match(page, /authorityScope=\{authorityScope\}/u);
assert.match(page, /authenticated \? \(/u);
assert.match(page, /Iniciá sesión para guardar/u);
assert.match(page, /subjectId: submittedSubjectId \|\| undefined/u);
assert.match(page, /searchReturnTo: searchSelectionHref/u);

const library = await read("apps/web/src/pages/Resources.tsx");
assert.match(library, /searchParams\.get\("view"\) === "saved"/u);
assert.match(library, /next\.set\("view", "saved"\)/u);
assert.match(library, /next\.delete\("view"\)/u);
assert.doesNotMatch(library, /setSavedMode\(/u);
assert.equal(
  searchReturnHref({
    searchReturnTo: searchSelectionHref({
      q: "parcial",
      scope: "resources",
      subjectId: "b2d9085e-4fa2-4f12-8b31-2acf4219d876",
    }),
  }),
  "/search?q=parcial&scope=resources&subjectId=b2d9085e-4fa2-4f12-8b31-2acf4219d876",
);

console.log("PASS Web Search quick-save UX, authority fence and safe return contract");
