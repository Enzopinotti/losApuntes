import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import {
  searchSelectionFromSearchParams,
  searchSelectionHref,
  searchSelectionKey,
  searchReturnHref,
} from '../apps/web/src/features/search/search-navigation.mjs';
import {
  isSaveConfirmed,
  saveFailureMessage,
} from '../apps/web/src/features/search/search-save-feedback.mjs';

const root = process.cwd();

// A feature PR must not weaken the repository-wide hygiene gate just to
// bypass Search formatting errors. Guard against swallowed checks.
const rootScripts = JSON.parse(
  await readFile(path.join(root, 'package.json'), 'utf8'),
).scripts;
assert.equal(
  rootScripts['check:hygiene'],
  'node scripts/check-repo-hygiene.mjs',
  'Search navigation must not bypass repository hygiene',
);


async function read(relativePath) {
  return readFile(path.join(root, relativePath), 'utf8');
}

const urlSelection = searchSelectionFromSearchParams(
  new URLSearchParams('q=Base+de+Datos&scope=subjects'),
);
assert.deepEqual(urlSelection, {
  q: 'Base de Datos',
  scope: 'subjects',
});
assert.equal(
  searchSelectionHref(urlSelection),
  '/search?q=Base+de+Datos&scope=subjects',
);
assert.equal(
  searchSelectionHref({ q: '  Matemática I  ', scope: 'all' }),
  '/search?q=Matem%C3%A1tica+I',
);
assert.deepEqual(
  searchSelectionFromSearchParams(new URLSearchParams('q=SQL&scope=private')),
  { q: 'SQL', scope: 'all' },
  'Unknown search scopes must never introduce hidden/private categories',
);
assert.deepEqual(
  searchSelectionFromSearchParams(new URLSearchParams('q=Python&q=secret&scope=resources')),
  { q: 'Python', scope: 'resources' },
  'Repeated query parameters must not append hidden terms',
);
for (const q of ['', 'a', ' '.repeat(3), 'x'.repeat(121), 'ok' + String.fromCharCode(10) + 'private']) {
  assert.equal(
    searchSelectionFromSearchParams(new URLSearchParams({ q })),
    null,
    'Invalid shared links must never trigger a search',
  );
  assert.equal(
    searchSelectionHref({ q, scope: 'all' }),
    null,
  );
}
const urlWithReservedCharacters = searchSelectionHref({
  q: 'Bases + redes & SQL',
  scope: 'resources',
});
assert.deepEqual(
  searchSelectionFromSearchParams(
    new URLSearchParams(urlWithReservedCharacters.split('?')[1]),
  ),
  { q: 'Bases + redes & SQL', scope: 'resources' },
);
assert.equal(
  searchSelectionKey(urlSelection),
  JSON.stringify(['Base de Datos', 'subjects', null]),
);
assert.notEqual(
  searchSelectionKey({ q: 'Base de Datos', scope: 'people' }),
  searchSelectionKey(urlSelection),
  'Changing the search category must invalidate prior result identity',
);
const subjectId = 'b2d9085e-4fa2-4f12-8b31-2acf4219d876';
const filteredSelection = {
  q: 'Parcial de programación',
  scope: 'resources',
  subjectId,
};
const filteredHref = searchSelectionHref(filteredSelection);
assert.equal(
  filteredHref,
  '/search?q=Parcial+de+programaci%C3%B3n&scope=resources&subjectId=' +
    subjectId,
);
assert.deepEqual(
  searchSelectionFromSearchParams(
    new URLSearchParams(filteredHref.split('?')[1]),
  ),
  filteredSelection,
);
assert.deepEqual(
  searchSelectionFromSearchParams(
    new URLSearchParams('q=parcial&subjectId=' + subjectId.toUpperCase()),
  ),
  { q: 'parcial', scope: 'all', subjectId },
  'A shared academic filter must normalize public UUID case',
);
assert.notEqual(
  searchSelectionKey(filteredSelection),
  searchSelectionKey({ q: filteredSelection.q, scope: 'resources' }),
  'Switching subjects must invalidate results from the previous filter',
);
assert.notEqual(
  searchSelectionKey(filteredSelection),
  searchSelectionKey({
    ...filteredSelection,
    subjectId: 'f4ab248d-23ee-443f-a1cf-52a0b4e77290',
  }),
);

for (const rejectedParams of [
  'q=parcial&subjectId=not-a-uuid',
  'q=parcial&subjectId=',
  'q=parcial&subjectId=b2d9085e-4fa2-3f12-8b31-2acf4219d876',
  'q=parcial&subjectId=' + subjectId + '&subjectId=' + subjectId,
  'q=parcial&scope=people&subjectId=' + subjectId,
  'q=parcial&scope=subjects&subjectId=' + subjectId,
]) {
  assert.equal(
    searchSelectionFromSearchParams(new URLSearchParams(rejectedParams)),
    null,
    'Invalid resource filters must not expand into unrestricted searches',
  );
}
assert.equal(
  searchSelectionHref({ ...filteredSelection, scope: 'people' }),
  null,
);
assert.equal(
  searchSelectionHref({ ...filteredSelection, subjectId: 'not-a-uuid' }),
  null,
);
assert.equal(
  searchReturnHref({ searchReturnTo: filteredHref }),
  filteredHref,
  'Return-to-search links must preserve the canonical subject filter',
);
assert.equal(
  searchReturnHref({
    searchReturnTo: filteredHref + '&accountId=private',
  }),
  null,
  'No sensitive extra parameters can enter a return link',
);
assert.equal(searchSelectionKey(null), null);
assert.equal(searchReturnHref({ searchReturnTo: '/search' }), '/search');
assert.equal(
  searchReturnHref({ searchReturnTo: '/search?q=SQL&scope=resources' }),
  '/search?q=SQL&scope=resources',
);
for (const returnTo of [
  null,
  '',
  'https://attacker.example/search?q=SQL',
  '//attacker.example/search?q=SQL',
  '/resources/something',
  '/search?q=SQL&scope=all',
  '/search?q=SQL&scope=resources&token=secret',
  '/search?q=SQL#private',
  '/search?q=x',
]) {
  assert.equal(
    searchReturnHref({ searchReturnTo: returnTo }),
    null,
    'Only canonical internal search links may be used as return targets',
  );
}
assert.equal(searchReturnHref(null), null);

const service = await read(
  'apps/web/src/features/search/services/searchService.ts',
);
assert.match(service, /credentials:\s*"include"/u);
assert.match(service, /cache:\s*"no-store"/u);
assert.match(service, /AbortSignal\.timeout\(15_000\)/u);
assert.match(service, /AbortSignal\.any/u);
assert.doesNotMatch(service, /localStorage|sessionStorage/u);
assert.doesNotMatch(service, /Authorization\s*:/iu);
assert.doesNotMatch(service, /Bearer\s+/u);

const page = await read('apps/web/src/pages/Search.tsx');
assert.match(
  page,
  /<AuthorProfileLink[\s\S]{0,120}profileId=\{resource\.author\?\.profileId\}/u,
);
assert.match(page, /searchApi\s*\.\s*search\s*\(/u);
assert.match(page, /searchApi\s*\.\s*contextual\s*\(/u);
assert.match(page, /status\s*===\s*"authenticated"/u);
assert.match(page, /useAsyncAuthorityFence/u);
assert.match(page, /beginSearchRequest/u);
assert.match(page, /isSearchRequestCurrent/u);
assert.match(page, /finishSearchRequest/u);
assert.match(page, /ticket\.signal/u);
assert.doesNotMatch(page, /let\s+active\s*=\s*true/u);
assert.doesNotMatch(page, /localStorage|sessionStorage/u);
assert.doesNotMatch(page, /careerDiscoveryOptIn|recommendationSignals/u);

assert.match(page, /useSearchParams/u);
assert.match(page, /searchSelectionFromSearchParams\(searchParams\)/u);
assert.match(page, /searchSelectionHref/u);
assert.match(page, /setSearchParams\(nextParams\)/u);
assert.match(page, /search:\$\{authorityScope\}:\$\{submittedKey/u);
assert.match(page, /resultScopeKey/u);
assert.match(page, /submittedScope === "resources"/u);
assert.match(page, /submittedSubjectId/u);
assert.match(page, /subjectId: submittedSubjectId \|\| undefined/u);
assert.match(page, /setSubjectId\(event\.target\.value\)/u);
assert.match(page, /contextual\?\.subjects\.map/u);
assert.match(page, /Materia \(solo apuntes\)/u);
assert.match(page, /Todas las materias/u);
assert.match(page, /Materia del enlace/u);
assert.match(page, /contextState\?\.scopeKey === authorityScope/u);
assert.match(page, /setContextState\(\{ scopeKey: authorityScope, data: value \}\)/u);
assert.doesNotMatch(
  page,
  /setContextual\(value\)/u,
  'Suggestions from a different account must never be displayed unscoped',
);
assert.match(page, /setSubjectId\(""\)/u);
assert.match(page, /copySearchLink/u);
assert.match(page, /navigator\.clipboard\?\.writeText/u);
assert.match(page, /role="status"/u);
assert.match(
  page,
  /to=\{`\/resources\/\$\{encodeURIComponent\(resource\.id\)\}`\}/u,
  'Search hits must open a specific resource, never rerun a title query',
);
assert.doesNotMatch(
  page,
  /\/resources\?q=\$\{encodeURIComponent\(resource\.title\)/u,
);
assert.match(page, /encodeURIComponent\(subject\.id\)/u);

// B175: Search now exposes a private, authenticated save action that reuses
// Resources authorization instead of granting permissions from search hits.
assert.equal(isSaveConfirmed({ saved: true }), true);
for (const invalid of [null, {}, { saved: false }, { saved: 1 }, { saved: 'true' }]) {
  assert.equal(
    isSaveConfirmed(invalid),
    false,
    'Missing or ambiguous acknowledgement must never render a saved success',
  );
}
for (const status of [401, 403, 404, 410]) {
  assert.match(
    saveFailureMessage({ status }),
    /Ya no podés guardar/u,
    'Authorization failures must not be displayed as confirmed saves',
  );
}
for (const failure of [null, new Error('offline'), { status: 503 }, { status: 0 }]) {
  assert.match(
    saveFailureMessage(failure),
    /No pudimos confirmar/u,
    'Network and runtime errors have an unknown commit outcome',
  );
}
const saveAction = await read(
  'apps/web/src/features/search/SearchSaveAction.tsx',
);
assert.match(saveAction, /resourcesApi\.save\(resourceId, ticket\.signal\)/u);
assert.match(saveAction, /isSaveConfirmed\(response\)/u);
assert.match(saveAction, /saveFailureMessage\(error\)/u);
assert.match(saveAction, /pendingRef\.current/u);
assert.match(saveAction, /useAsyncAuthorityFence\(scopeKey\)/u);
assert.match(saveAction, /disabled=\{saving \|\| saved\}/u);
assert.match(saveAction, /role=\{current\.phase === "failed" \? "alert" : "status"\}/u);
assert.doesNotMatch(saveAction, /localStorage|sessionStorage|setItem/u);
assert.doesNotMatch(saveAction, /Authorization\s*:|Bearer\s+/iu);
assert.match(page, /import \{ SearchSaveAction \} from/u);
assert.match(page, /\{authenticated && \(/u);
assert.match(page, /<SearchSaveAction/u);
assert.match(page, /authorityScope=\{authorityScope\}/u);
assert.match(page, /resourceId=\{resource\.id\}/u);
assert.ok(
  page.includes('key={`${authorityScope}:${resource.id}`}'),
  'Save state must be isolated per session and resource',
);
assert.match(page, /subjectId: submittedSubjectId \|\| undefined/u);
assert.match(page, /Iniciá sesión/u);
const saveStyles = await read('apps/web/src/pages/Search.scss');
assert.match(saveStyles, /\.search-save-action button:focus-visible/u);
assert.match(saveStyles, /\.search-save-action p\[role="alert"\]/u);
const resourcesService = await read(
  'apps/web/src/features/resources/services/resourcesService.ts',
);
assert.match(resourcesService, /save: \(resourceId: string, signal\?: AbortSignal\)/u);
assert.match(resourcesService, /\/resources\/\$\{encodeURIComponent\(resourceId\)\}\/save/u);
assert.match(resourcesService, /method: "PUT", signal/u);

const resourcesPage = await read('apps/web/src/pages/Resources.tsx');
assert.match(resourcesPage, /searchReturnHref\(location\.state\)/u);
assert.match(resourcesPage, /resourceReturnTo/u);
assert.match(resourcesPage, /Volver a la búsqueda/u);
assert.match(page, /searchReturnTo:/u);

const routes = await read('apps/web/src/app/routes.tsx');
assert.match(
  routes,
  /\{\s*path:\s*"search",\s*element:\s*<Search\s*\/>\s*\}/u,
  'Global search must remain anonymous-readable',
);

console.log('PASS Web Search privacy/transport contract');
