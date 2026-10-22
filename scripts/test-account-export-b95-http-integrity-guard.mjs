import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = path => readFileSync(new URL('../' + path, import.meta.url), 'utf8');
const loop = read('scripts/test-account-export-b86-s3-loopback.test.mjs');
const s3 = read('apps/api/src/files/storage/s3-object-storage.ts');
const preflight = read('apps/api/src/data-lifecycle/domain/account-export-artifact-readback.ts');
const streaming = read('apps/api/src/data-lifecycle/storage/account-export-download-integrity.ts');
const pkg = JSON.parse(read('package.json')).scripts;
const docs = read('docs/operations/account-export-artifacts.md');

const tests = [...loop.matchAll(/test\('([^']+)'/gu)]
  .map(m => m[1]).filter(name => name.startsWith('B95 '));
let count = 0;
function check(name, run) { run(); count++; console.log('PASS ' + name); }

check('B95 covers six actual HTTP S3 readback scenarios', () => {
  assert.equal(tests.length, 6);
  assert.equal(new Set(tests).size, 6);
});
check('B95 uses the actual production S3 signed request adapter', () => {
  assert.match(loop, /createS3ObjectStorage\(\{/u);
  assert.match(loop, /server\.listen\(0, '127\.0\.0\.1', resolve\)/u);
  assert.match(loop, /verifyB87S3SigV4\(\{/u);
  assert.doesNotMatch(loop, /jest\.spyOn\(globalThis, 'fetch'\)/u);
});
check('B95 faults act after signature verification and before GET HTTP response', () => {
  const trusted = loop.indexOf('const trusted = verifyB87S3SigV4(');
  const denied = loop.indexOf('response.writeHead(403)');
  const fault = loop.indexOf('const fault = getFaults.shift()');
  assert.ok(trusted >= 0 && denied > trusted && fault > denied);
  assert.match(loop, /getFaults = \[\.\.\.\(input\.getFaults \?\? \[\]\)\]/u);
});
check('B95 includes 200 same-size corrupt, truncation, oversize, 404 and 503 GET', () => {
  for (const name of ["'corrupt'", "'short'", "'large'", "'404'", "'503'"]) {
    assert.ok(loop.includes(name));
  }
  assert.match(loop, /delivered\[Math\.floor\(delivered\.length \/ 2\)\] \^= 0x01/u);
});
check('B95 controls provider-body integrity using actual B90 helper', () => {
  assert.match(loop, /verifyAccountExportStoredBytes\(\s*storage\.readObjectChunks\(OBJECT_KEY\)/u);
  assert.match(preflight, /timingSafeEqual\(storedHash, expectedHash\)/u);
  assert.match(preflight, /chunk\.byteLength > expected\.byteLength - bytesRead/u);
});
check('B95 second real HTTP GET uses actual B91 streaming SHA guard', () => {
  assert.match(loop, /verifyAccountExportDownload\(\s*storage\.readObjectChunks\(OBJECT_KEY\)/u);
  assert.match(streaming, /download integrity check failed/u);
});
check('B95 tampering does not change the object or automatically delete it', () => {
  assert.match(loop, /assert\.deepEqual\(objects\.get\(PATH\), B95_CONTENT\)/u);
  assert.match(loop, /\['PUT', 'GET', 'GET'\]/u);
  assert.match(loop, /\['PUT', 'GET'\]/u);
});
check('B95 keeps original real TCP signature and lost-ACK cases', () => {
  assert.match(loop, /B86 signed real HTTP PUT\/GET\/DELETE round-trip/u);
  assert.match(loop, /B86 lost single PUT response preserves/u);
  assert.match(loop, /B86 lost multipart completion ACK/u);
  assert.match(loop, /B87 loopback rejects a forged SigV4/u);
});
check('B95 shared adapter retains bounded read and S3 GET status validation', () => {
  assert.match(s3, /!isConfirmedS3FullObjectGet\(response\.status\)[\s\S]*?throw storageError\('GET object', response\.status\)/u);
  assert.match(s3, /maximumChunkBytes = 64 \* 1024/u);
  assert.match(s3, /async \*readObjectChunks\(/u);
});
check('B95 validation is part of the root lifecycle and has standalone command', () => {
  assert.match(pkg['test:account-lifecycle-contract'],
    /test-account-export-b86-s3-loopback\.test\.mjs/u);
  assert.match(pkg['test:account-lifecycle-contract'],
    /test-account-export-b95-http-integrity-guard\.mjs/u);
  assert.match(pkg['test:account-export-b95-http-integrity'],
    /test-name-pattern B95/u);
});
check('B95 ops retains HOLD and no provider claims', () => {
  assert.match(docs, /## B95/u);
  assert.match(docs, /#353 HOLD/u);
  assert.match(docs, /AWS\/MinIO/u);
});
console.log('B95 signed HTTP readback: ' + count + ' structural checks PASS');
