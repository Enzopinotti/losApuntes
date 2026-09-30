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
assert.match(service, /truncated:\s*boolean/u);
assert.match(service, /limit:\s*number/u);

assert.match(interfaces, /followsTruncated:\s*boolean/u);
assert.match(interfaces, /followsLimit:\s*number/u);
assert.match(interfaces, /AcademicAffiliationListResponse/u);
assert.match(interfaces, /truncated:\s*boolean/u);

assert.match(page, /affiliationsTruncated/u);
assert.match(page, /affiliationLimit/u);
assert.match(page, /followsTruncated/u);
assert.match(page, /followsLimit/u);
assert.match(page, /ACADEMIC_INVENTORY_OVERFLOW/u);
assert.match(
  page,
  /no la usamos de forma truncada\s+para decisiones de lifecycle/u,
);

console.log('PASS Web Academic bounded inventory contract');
