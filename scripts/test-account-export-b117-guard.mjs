import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = path => readFileSync(new URL('../' + path, import.meta.url), 'utf8');
const http = read('scripts/test-account-export-b86-s3-loopback.test.mjs');
const runner = read('scripts/run-account-export-b101-signed-http.mjs');
const adapter = read('apps/api/src/files/storage/s3-object-storage.ts');
const head = read('apps/api/src/files/storage/s3-head-object-contract.ts');
const native = read('scripts/test-account-export-b116-head.test.mjs');
const b116 = read('scripts/test-account-export-b116-guard.mjs');
const pkg = JSON.parse(read('package.json')).scripts;
const ops = read('docs/operations/account-export-artifacts.md');
const config = read('apps/api/src/config/runtime-environment.ts');

let passed = 0;
const check = (name, action) => {
  action();
  passed++;
  console.log('PASS ' + name);
};

check('B117 fixture sends HEAD through the original signed S3 TCP adapter', () => {
  const auth = http.indexOf('const trusted = verifyB87S3SigV4({');
  const deny = http.indexOf('if (!trusted)');
  const branch = http.indexOf("} else if (method === 'HEAD') {");
  assert.ok(auth >= 0 && deny > auth && branch > deny);
  assert.match(http, /server\.listen\(0, '127\.0\.0\.1', resolve\)/u);
  assert.match(http, /const storage = createS3ObjectStorage\(/u);
  assert.match(http, /captureHeadHeaders/u);
});

check('B117 signed HEAD positive case includes 200, metadata and post-delete 404', () => {
  assert.match(http, /B117 signed HEAD confirms exact private metadata and returns 404 after deletion/u);
  assert.match(http, /assert\.deepEqual\(head, \{/u);
  assert.match(http, /SignedHeaders=host;x-amz-content-sha256;x-amz-date,/u);
  assert.match(http, /assert\.equal\(await storage\.headObject\(OBJECT_KEY\), null\)/u);
});

check('B117 signed HEAD rejects 202 and 206 without deleting private bytes', () => {
  assert.match(http, /B117 signed HEAD rejects unconfirmed HTTP 202 and partial HTTP 206 metadata/u);
  assert.match(http, /for \(const status of \[202, 206\]\)/u);
  assert.match(http, /a failed metadata read cannot mutate the private object/u);
});

check('B117 signed HEAD rejects 204 and incomplete metadata', () => {
  assert.match(http, /B117 signed HEAD denies 204 and an HTTP 200 missing Content-Length/u);
  assert.match(http, /omitLength: true/u);
  assert.match(http, /S3 HEAD returned an invalid content length/u);
});

check('B117 signed HEAD negative lengths preserve object and deny publication', () => {
  assert.match(http, /B117 signed HEAD fails closed for noncanonical and unsafe Content-Length/u);
  assert.match(http, /'01', '8e2', '8, 8', '9007199254740992'/u);
  assert.match(http, /calls\.some\(call => call\.method === 'DELETE'\), false/u);
});

check('B117 TAP gate requires all 61 signed cases without omissions', () => {
  const names = [...http.matchAll(/test\('([^']+)'/gu)].map(match => match[1]);
  assert.equal(names.length, 61);
  assert.equal(new Set(names).size, 61);
  assert.equal(names.filter(name => name.startsWith('B117 ')).length, 4);
  assert.match(runner, /expectedNames\.length < 61/u);
  assert.match(runner, /'B115 ', 'B117 ', 'B119 ', 'B120 '/u);
  assert.match(runner, /verifyB101SignedHttpTap\(/u);
  assert.match(runner, /classifyB107SignedHttpRuntime\(/u);
});

check('B117 retains B116 production boundary and native tests', () => {
  assert.match(adapter, /if \(!isConfirmedS3HeadObject\(response\.status\)\)/u);
  assert.match(adapter, /parseS3HeadObjectByteSize\(/u);
  assert.match(head, /return status === 200/u);
  assert.match(native, /B116 HEAD confirms only HTTP 200/u);
  assert.match(b116, /## B116/u);
});

check('B117 runnable command is included in the existing lifecycle gate', () => {
  assert.match(pkg['test:account-export-b117-signed-head'],
    /test-account-export-b117-guard\.mjs/u);
  assert.match(pkg['test:account-export-b117-signed-head'],
    /run-account-export-b101-signed-http\.mjs/u);
  assert.match(pkg['test:account-lifecycle-contract'],
    /test-account-export-b117-guard\.mjs/u);
});

check('B117 leaves production disabled and release HOLD unchanged', () => {
  assert.match(config, /STUDY_PROGRESS_ENABLED must remain false in production/u);
  assert.match(ops, /## B117/u);
  assert.match(ops, /#353 HOLD/u);
  assert.match(ops, /57 casos HTTP firmados/u);
});

console.log('B117 signed S3 HEAD acceptance: ' + passed + '/9 guards PASS');
