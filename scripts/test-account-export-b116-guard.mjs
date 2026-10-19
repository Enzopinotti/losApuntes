import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = path => readFileSync(new URL('../' + path, import.meta.url), 'utf8');
const adapter = read('apps/api/src/files/storage/s3-object-storage.ts');
const helper = read('apps/api/src/files/storage/s3-head-object-contract.ts');
const etagHelper = read('apps/api/src/files/storage/s3-head-etag.ts');
const native = read('scripts/test-account-export-b116-head.test.mjs');
const jest = read('apps/api/src/files/storage/s3-object-storage.spec.ts');
const pkg = JSON.parse(read('package.json')).scripts;
const ops = read('docs/operations/account-export-artifacts.md');
const config = read('apps/api/src/config/runtime-environment.ts');

let passed = 0;
function check(label, verify) {
  verify();
  passed++;
  console.log('PASS ' + label);
}

check('B116 HEAD status only confirms exact HTTP 200', () => {
  assert.match(helper, /return status === 200/u);
  assert.match(adapter, /if \(response\.status === 404\) return null/u);
  assert.match(adapter, /if \(!isConfirmedS3HeadObject\(response\.status\)\)/u);
});

check('B116 no permissive Number coercion in metadata confirmation', () => {
  assert.match(helper, /\^\(0\|\[1-9\]\[0-9\]\*\)\$/u);
  assert.match(helper, /Number\.isSafeInteger\(bytes\)/u);
  assert.match(helper, /raw === null/u);
  const start = adapter.indexOf('    async headObject(');
  const end = adapter.indexOf('    async readPrefix(', start);
  const head = adapter.slice(start, end);
  assert.ok(start > 0 && end > start);
  assert.match(head, /parseS3HeadObjectByteSize\(/u);
  assert.doesNotMatch(head, /response\.ok|Number\(rawLength\)/u);
});

check('B116 adapter preserves signed HEAD and legacy metadata projection', () => {
  const head = adapter.slice(adapter.indexOf('    async headObject('),
    adapter.indexOf('    async readPrefix('));
  assert.match(head, /method: 'HEAD'/u);
  assert.match(head, /contentType: response\.headers\.get\('content-type'\)/u);
  // B119 hardened HEAD metadata by validating optional ETags instead of
  // exposing untrusted raw response bytes from the storage provider.
  assert.match(
    head,
    /etag: normalizeS3HeadObjectEtag\(response\.headers\.get\('etag'\)\)/u,
  );
  assert.match(etagHelper, /if \(raw === null\) return null/u);
  assert.match(etagHelper, /throw new Error\('S3 HEAD returned an invalid ETag'\)/u);
});

check('B116 tests include 2xx denial, canonical metadata and positive behavior', () => {
  assert.match(native, /HEAD confirms only HTTP 200/u);
  assert.match(native, /missing Content-Length/u);
  assert.match(native, /duplicate\/injected headers/u);
  assert.match(native, /values beyond JS safe integer/u);
  assert.match(jest, /B116 rejects ambiguous HTTP %s HEAD/u);
  assert.match(jest, /B116 rejects noncanonical HEAD Content-Length/u);
  assert.match(jest, /B116 does not accept successful HEAD without Content-Length/u);
  assert.match(jest, /HEADs objects with signed server credentials/u);
});

check('B116 scripts run native test and guard in lifecycle', () => {
  assert.match(pkg['test:account-export-b116-head'], /test-account-export-b116-head\.test\.mjs/u);
  assert.match(pkg['test:account-export-b116-head'], /test-account-export-b116-guard\.mjs/u);
  assert.match(pkg['test:account-lifecycle-contract'], /test-account-export-b116-guard\.mjs/u);
});

check('B116 does not lift Study Progress release HOLD', () => {
  assert.match(config, /STUDY_PROGRESS_ENABLED must remain false in production/u);
  assert.match(ops, /## B116/u);
  assert.match(ops, /#353 HOLD/u);
  assert.match(ops, /53 escenarios TCP firmados/u);
});

console.log('B116 strict S3 HEAD contract: ' + passed + '/6 guards PASS');
