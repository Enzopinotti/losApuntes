import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = path => readFileSync(new URL('../' + path, import.meta.url), 'utf8');
const adapter = read('apps/api/src/files/storage/s3-object-storage.ts');
const helper = read('apps/api/src/files/storage/s3-bounded-prefix-body.ts');
const native = read('scripts/test-account-export-b109-prefix-stream.test.mjs');
const jest = read('apps/api/src/files/storage/s3-object-storage.spec.ts');
const http = read('scripts/test-account-export-b86-s3-loopback.test.mjs');
const runner = read('scripts/run-account-export-b101-signed-http.mjs');
const tap = read('scripts/testing/b101-signed-http-tap.mjs');
const pkg = JSON.parse(read('package.json')).scripts;
const config = read('apps/api/src/config/runtime-environment.ts');
const ops = read('docs/operations/account-export-artifacts.md');

let passed = 0;
function check(name, fn) {
  fn();
  passed++;
  console.log('PASS ' + name);
}

check('B109 signed prefix GET no longer buffers untrusted entire response', () => {
  const begin = adapter.indexOf('    async readPrefix(');
  const end = adapter.indexOf('    async *readObjectChunks(', begin);
  assert.ok(begin > 0 && end > begin);
  const part = adapter.slice(begin, end);
  assert.match(part, /method: 'GET'/u);
  assert.match(part, /maximumBytes - 1/u);
  assert.match(part, /return readBoundedS3PrefixBody\(response, maximumBytes\)/u);
  assert.doesNotMatch(part, /arrayBuffer\(\)/u);
});

check('B109 bounded helper rejects excess before retaining/copying provider bytes', () => {
  const bound = helper.indexOf('value.byteLength > maximumBytes - total');
  const copy = helper.indexOf('chunks.push(Uint8Array.from(value))');
  assert.ok(bound > 0 && copy > bound);
  assert.match(helper, /throw new Error\('S3 returned more bytes than the requested prefix'\)/u);
  assert.match(helper, /total \+= value.byteLength/u);
});

check('B109 errors and overflow cancel stream without masking primary error', () => {
  assert.match(helper, /reader\.cancel\(\)\.catch\(\(\) => undefined\)/u);
  assert.match(helper, /reader\.releaseLock\(\)/u);
  assert.match(helper, /if \(!finished\)/u);
  assert.match(native, /oversized first provider chunk and cancels it/u);
  assert.match(native, /cancels a rejected upstream read/u);
});

check('B109 returns bounded owned bytes and ignores empty-flood chunks', () => {
  assert.match(helper, /if \(value.byteLength === 0\) continue/u);
  assert.match(helper, /Uint8Array.from\(value\)/u);
  assert.match(helper, /const result = new Uint8Array\(total\)/u);
  assert.match(native, /zero-byte chunk floods/u);
  assert.match(native, /mutable producer buffer/u);
});

check('B109 Jest covers signed range, early oversized and progressive overflow', () => {
  assert.match(jest, /B109 cancels an oversized streamed GET prefix/u);
  assert.match(jest, /B109 cancels a progressive prefix overflow/u);
  assert.match(jest, /B109 retains exact-byte prefix output/u);
  assert.match(jest, /bytes=0-7/u);
});

check('B109 localhost SigV4 fixtures verify oversized and correct GET prefix', () => {
  assert.match(http, /B109 signed HTTP rejects ignored Range/u);
  assert.match(http, /B109 signed HTTP returns exact small prefix/u);
  assert.match(http, /verifyB87S3SigV4\(\{/u);
  assert.match(http, /objects\.get\(PATH\)/u);
});

check('B109 release runner requires all 61 current signed HTTP scenarios', () => {
  const names = [...http.matchAll(/test\('([^']+)'/gu)].map(m => m[1]);
  assert.equal(names.length, 61);
  assert.equal(new Set(names).size, 61);
  assert.equal(names.filter(name => name.startsWith('B109 ')).length, 2);
  assert.match(runner, /expectedNames\.length < 61/u);
  assert.match(runner, /'B108 ', 'B109 '/u);
  assert.match(tap, /summary\.skipped !== 0/u);
});

check('B109 stays in lifecycle with #353 release HOLD and private production disabled', () => {
  assert.match(pkg['test:account-export-b109-bounded-prefix'],
    /test-account-export-b109-prefix-stream\.test\.mjs/u);
  assert.match(pkg['test:account-lifecycle-contract'],
    /test-account-export-b109-guard\.mjs/u);
  assert.match(config, /STUDY_PROGRESS_ENABLED must remain false in production/u);
  assert.match(ops, /## B109/u);
  assert.match(ops, /#353 HOLD/u);
});

console.log('B109 signed bounded-prefix stream: ' + passed + '/8 guards PASS');
