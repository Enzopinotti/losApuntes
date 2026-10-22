import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = path => readFileSync(new URL('../' + path, import.meta.url), 'utf8');
const source = read('scripts/test-account-export-b86-s3-loopback.test.mjs');
const loader = read('scripts/testing/resolve-api-typescript.mjs');
const registrar = read('scripts/testing/register-api-typescript.mjs');
const runner = read('scripts/run-account-export-b101-signed-http.mjs');
const tap = read('scripts/testing/b101-signed-http-tap.mjs');
const tests = read('scripts/test-account-export-b101-loader.test.mjs');
const b86Guard = read('scripts/test-account-export-b86-guard.mjs');
const b100Guard = read('scripts/test-account-export-b100-guard.mjs');
const pkg = JSON.parse(read('package.json')).scripts;
const config = read('apps/api/src/config/runtime-environment.ts');
const ops = read('docs/operations/account-export-artifacts.md');

let count = 0;
const check = (name, verify) => {
  verify();
  count += 1;
  console.log('PASS ' + name);
};

check('B101 limits local TypeScript resolving to the API source tree', () => {
  assert.match(loader, /apiSourceRoot = new URL/u);
  assert.match(loader, /parent\.startsWith\(apiSourceRoot\.href\)/u);
  assert.match(loader, /candidate\.href\.startsWith\(apiSourceRoot\.href\)/u);
  assert.match(loader, /nextResolve\(specifier, context\)/u);
  assert.match(registrar, /register\(new URL\('\.\/resolve-api-typescript\.mjs'/u);
});
check('B101 signed HTTP command loads real S3 TS adapter', () => {
  const lifecycle = pkg['test:account-lifecycle-contract'];
  assert.match(lifecycle, /--import \.\/scripts\/testing\/register-api-typescript\.mjs --test scripts\/test-account-export-b86-s3-loopback\.test\.mjs/u);
  assert.match(pkg['test:account-export-b95-http-integrity'], /--import \.\/scripts\/testing\/register-api-typescript\.mjs/u);
  assert.match(pkg['test:account-export-b101-signed-http'], /run-account-export-b101-signed-http\.mjs/u);
});
check('B101 B86/B87/B95/B96/B97/B99/B100/B101 fixture inventory is complete', () => {
  const names = [...source.matchAll(/test\('([^']+)'/gu)].map(match => match[1]);
  assert.ok(names.length >= 22);
  assert.equal(new Set(names).size, names.length);
  for (const prefix of ['B86 ', 'B87 ', 'B95 ', 'B96 ', 'B97 ', 'B99 ', 'B100 ', 'B101 ']) {
    assert.ok(names.some(name => name.startsWith(prefix)));
  }
  assert.match(source, /createS3ObjectStorage\(\{/u);
  assert.match(source, /verifyB87S3SigV4\(\{/u);
});
check('B101 verifies protected initiation and stored bytes through signed TCP', () => {
  assert.match(source, /B101 SigV4 HTTP accepts bucket\/key-fenced initiation/u);
  assert.match(source, /B101 SigV4 HTTP rejects cross-key initiation/u);
  assert.match(source, /await verifyAccountExportStoredBytes\(storage\.readObjectChunks\(OBJECT_KEY\)/u);
  assert.match(source, /assert\.equal\(calls\.some\(call => call\.method === 'DELETE'\), false\)/u);
});
check('B101 TAP runner enforces full unskipped results rather than exit 0', () => {
  assert.match(runner, /verifyB101SignedHttpTap\(/u);
  assert.match(runner, /STUDY_PROGRESS_ENABLED === 'true'/u);
  assert.match(runner, /'127\.0\.0\.1'/u);
  assert.match(runner, /Node22 signed HTTP diagnostic PASS/u);
  assert.match(tap, /summary\.skipped !== 0/u);
  assert.match(tap, /summary\.tests !== expectedNames\.length/u);
  assert.match(tap, /expectedNames\.some\(name => !passing\.includes\(name\)\)/u);
  assert.match(tests, /rejects omitted and skipped tests/u);
});
check('B101 fixes B100 parser guard to accept destination-fenced arguments', () => {
  assert.match(b100Guard, /segment\.indexOf\('parseConfirmedS3MultipartUploadId\(xml, \{'\)/u);
});
check('B101 keeps B86 Mongo security and B94 five-scenario evidence', () => {
  assert.match(b86Guard, /validateB89LocalMongoUri/u);
  assert.match(b86Guard, /verifyB94MongoAcceptanceReport/u);
});
check('B101 is part of lifecycle without disabling production HOLD', () => {
  assert.match(pkg['test:account-lifecycle-contract'], /test-account-export-b101-loader\.test\.mjs/u);
  assert.match(pkg['test:account-lifecycle-contract'], /test-account-export-b101-guard\.mjs/u);
  assert.match(config, /STUDY_PROGRESS_ENABLED must remain false in production/u);
  assert.match(ops, /## B101/u);
  assert.match(ops, /#353 HOLD/u);
});
console.log('B101 S3 signed HTTP acceptance contracts: ' + count + '/8 PASS');
