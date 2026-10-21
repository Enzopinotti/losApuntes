import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  normalizeStudyKitResourceQuery,
  studyKitResourceSearchScope,
  STUDY_KIT_RESOURCE_QUERY_MAX,
} from "../apps/web/src/features/study/study-kit-resource-query.mjs";
const root=new URL("../",import.meta.url);
const read=(path)=>readFileSync(new URL(path,root),"utf8");
const routes=read("apps/web/src/app/routes.tsx");
const kits=read("apps/web/src/pages/StudyKits.tsx");
const workbench=read("apps/web/src/pages/StudyWorkbench.tsx");
const planner=read("apps/web/src/pages/StudySession.tsx");
const model=read("apps/web/src/features/study/study-portable-kits.mjs");
const memory=read("apps/web/src/features/study/study-kit-workspace.mjs");
assert.match(routes,/path: "study\/kits"[\s\S]*?<PrivateRoute>/u);
assert.match(workbench,/Organizar colecciones portátiles/u);
assert.match(planner,/Mis colecciones portátiles/u);
assert.match(kits,/studySubjectSelectionFromParams\(params\)/u);
assert.match(kits,/resolveStudySubject\(selection, context\.data\.subjects\)/u);
assert.match(kits, /subjectLimit:\s*8,\s*resourcesPerSubject:\s*1/u);
assert.match(kits, /resourcesApi\.savedBySubject\(\s*subjectId,\s*cursor,\s*ticket\.signal,?\s*\)/u);
assert.match(kits, /resourcesApi\.search\(\s*\{\s*subjectId,\s*cursor\s*\},\s*ticket\.signal,?\s*\)/u);
assert.match(kits,/resourcesApi\.get\(resourceId,\s*signal\)/u);
assert.match(kits,/result\.resource\.academic\.subject\.id\s*===\s*subjectId/u);
assert.match(kits,/Math\.min\(4,\s*ids\.length\)/u);
assert.match(kits,/useAsyncAuthorityFence/u);
assert.match(kits,/scope === verifyKey/u);
assert.match(kits,/createForm\?\.scope === scope/u);
assert.match(kits,/newTitle = createForm\?\.scope === scope/u);
assert.match(kits,/newNotes = createForm\?\.scope === scope/u);
assert.match(kits, /const activeScopeRef\s*=\s*useRef\(scope\)/u);
assert.match(kits, /activeScopeRef\.current\s*!==\s*startedScope/u);
assert.match(kits,/readStudyKitArchive\(text\)/u);
assert.match(kits, /candidate\.subjectId\s*!==\s*subjectId/u);
assert.match(kits,/window\.confirm\(/u);
assert.match(kits,/serializeStudyKitArchive\(archive\)/u);
assert.match(kits, /createStudyHandoff\(\s*plan,\s*scope\s*\)/u);
assert.match(kits, /studyKitToSession\(\s*archive,\s*selectedKit\.id\s*\)/u);
assert.match(kits, /state:\s*handoff/u);
assert.match(kits,/URL\.revokeObjectURL\(url\)/u);
assert.match(kits, /saveStudyKitWorkspace\(\s*scope,\s*next\s*\)/u);
assert.match(kits,/forgetStudyKitWorkspace\(scope\)/u);
assert.match(kits,/title=item\.title|item\.title/u);
assert.match(kits,/Referencia sin acceso confirmado/u);
assert.match(model,/STUDY_KIT_MAX_COLLECTIONS = 12/u);
assert.match(model,/STUDY_KIT_MAX_RESOURCES = 24/u);
assert.match(model,/new TextEncoder\(\)\.encode\(source\)/u);
assert.match(memory,/const MAX_SCOPES = 5/u);
assert.doesNotMatch(kits,/localStorage|sessionStorage|indexedDB/iu);
assert.match(kits, /PERSISTENT_COLLECTIONS_VISIBLE\s*&&\s*\(/u);
assert.match(kits,/if \(\s*!PERSISTENT_COLLECTIONS_VISIBLE \|\|/u);
assert.match(kits,/syncStudyKitToCollection\(/u);
assert.match(kits,/studyCollectionsApi\.create\(input, signal\)/u);
assert.match(kits,/studyCollectionsApi\.add\(collectionId, resourceId, signal\)/u);
assert.doesNotMatch(model,/resource\.title|signedUrl|author\.displayName/u);

const canonicalSubjectId = "a1af6e19-7bc8-44b0-b3f5-7fb7746b1e80";
const secondarySubjectId = "a1af6e19-7bc8-44b0-b3f5-7fb7746b1e81";
assert.equal(STUDY_KIT_RESOURCE_QUERY_MAX, 120);
assert.equal(normalizeStudyKitResourceQuery("  Algebra lineal  "), "Algebra lineal");
assert.equal(normalizeStudyKitResourceQuery("x".repeat(120)), "x".repeat(120));
for (const invalid of [
  null,
  22,
  "",
  " ",
  " x ",
  "x".repeat(121),
  `resumen${String.fromCharCode(10)}matrices`,
]) {
  assert.equal(
    normalizeStudyKitResourceQuery(invalid),
    null,
    "Invalid input cannot silently broaden the server resource search",
  );
}
const scope = studyKitResourceSearchScope(
  "user:one:session:one",
  canonicalSubjectId,
  "  álgebra  ",
);
assert.equal(
  scope,
  JSON.stringify(["user:one:session:one", canonicalSubjectId, "álgebra"]),
);
assert.notEqual(
  scope,
  studyKitResourceSearchScope(
    "user:one:session:two",
    canonicalSubjectId,
    "álgebra",
  ),
  "Switching session must prevent reuse of resource search results",
);
assert.notEqual(
  scope,
  studyKitResourceSearchScope("user:one:session:one", secondarySubjectId, "álgebra"),
  "Switching subject must prevent reuse of resource search results",
);
assert.equal(
  studyKitResourceSearchScope("user:one:session:one", "unsafe", "álgebra"),
  null,
);
assert.equal(
  studyKitResourceSearchScope("user:one:session:one", canonicalSubjectId, "a"),
  null,
);
const finder = read("apps/web/src/features/study/StudyKitResourceSearch.tsx");
assert.match(finder, /resourcesApi\.search\(/u);
assert.match(finder, /subjectId, q: submitted, cursor/u);
assert.match(finder, /resource\.academic\.subject\.id === subjectId/u);
assert.match(finder, /ticket\.signal/u);
assert.match(finder, /useAsyncAuthorityFence/u);
assert.match(finder, /isSearchCurrent\(ticket\)/u);
assert.match(finder, /normalizeStudyKitResourceQuery\(draft\)/u);
assert.match(finder, /<form onSubmit=\{submit\}/u);
assert.match(finder, /setSubmitted\(query\)/u);
assert.match(finder, /setSubmitted\(null\)/u);
assert.match(finder, /onAdd\(resource\.id\)/u);
assert.match(finder, /knownIds\.has\(resource\.id\)/u);
assert.match(finder, /limitReached/u);
assert.match(finder, /role="alert"/u);
assert.match(finder, /nextCursor/u);
assert.match(finder, /Más resultados de búsqueda/u);
assert.doesNotMatch(finder, /localStorage|sessionStorage|indexedDB/u);
assert.match(kits, /<StudyKitResourceSearch/u);
assert.match(kits, /authorityScope=\{scope\}/u);
assert.match(kits, /subjectId=\{subjectId\}/u);
assert.match(kits, /resourceIds=\{selectedKit\.resourceIds\}/u);
assert.match(kits, /updateSelected\(\(value\) =>/u);
const finderStyles = read("apps/web/src/pages/StudyKits.scss");
assert.match(finderStyles, /\.study-kits-lookup-form input/u);
assert.match(finderStyles, /\.study-kits-lookup button/u);
const apiService = read(
  "apps/web/src/features/resources/services/resourcesService.ts",
);
assert.match(apiService, /if \(input\.q\) query\.set\("q", input\.q\)/u);
assert.match(apiService, /if \(input\.subjectId\) query\.set\("subjectId", input\.subjectId\)/u);

console.log("Portable study kits Web integration checks PASS");