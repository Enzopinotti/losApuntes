import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = (path) =>
  readFile(new URL(`../${path}`, import.meta.url), 'utf8');

const [service, interfaces, page] = await Promise.all([
  read('apps/web/src/features/academic/services/academicService.ts'),
  read('apps/web/src/features/academic/interfaces.ts'),
  read('apps/web/src/pages/AcademicLifecycle.tsx'),
]);

assert.match(service, /AcademicAffiliationListResponse/u);
assert.match(service, /function requestSignal\(signal\?: AbortSignal \| null\)/u);
assert.match(service, /AbortSignal\.any\(\[signal, timeout\]\)/u);
assert.match(service, /signal: requestSignal\(init\.signal\)/u);
assert.match(service, /lifecycle: \(signal\?: AbortSignal\)/u);
assert.match(service, /affiliations: \(signal\?: AbortSignal\)/u);
assert.match(service, /searchCatalog:[\s\S]*signal\?: AbortSignal/u);
assert.match(service, /truncated:\s*boolean/u);
assert.match(service, /limit:\s*number/u);

assert.match(interfaces, /followsTruncated:\s*boolean/u);
assert.match(interfaces, /followsLimit:\s*number/u);
assert.match(interfaces, /AcademicAffiliationListResponse/u);
assert.match(interfaces, /truncated:\s*boolean/u);

assert.match(page, /affiliationsTruncated/u);
assert.match(page, /useAuth\(\)/u);
assert.match(page, /user\?\.id/u);
assert.match(page, /session\?\.id/u);
assert.equal((page.match(/useAsyncAuthorityFence\(/gu) ?? []).length, 3);
assert.match(page, /academic-load:\$\{authScopeKey\}/u);
assert.match(page, /academic-mutation:\$\{authScopeKey\}/u);
assert.match(page, /academic-search:\$\{searchScopeKey\}/u);
assert.match(page, /academicApi\.lifecycle\(ticket\.signal\)/u);
assert.match(page, /academicApi\.affiliations\(ticket\.signal\)/u);
assert.match(page, /academicApi\.node\(id, ticket\.signal\)/u);
assert.match(page, /await loadRef\.current\(\)/u);
assert.match(page, /if \(!isMutationCurrent\(ticket\)\) return false/u);
assert.match(page, /if \(!isSearchCurrent\(ticket\)\) return/u);
assert.match(page, /snapshotState\?\.scopeKey === authScopeKey/u);
assert.match(page, /searchState\?\.scopeKey === searchScopeKey/u);
assert.match(page, /affiliationLimit/u);
assert.match(page, /followsTruncated/u);
assert.match(page, /followsLimit/u);
assert.match(page, /ACADEMIC_INVENTORY_OVERFLOW/u);
assert.match(
  page,
  /no la usamos de forma truncada\s+para decisiones de lifecycle/u,
);

console.log('PASS Web Academic bounded inventory contract');
