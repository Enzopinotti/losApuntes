import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = path => readFileSync(new URL('../' + path, import.meta.url), 'utf8');
const adapter = read('apps/api/src/files/storage/s3-object-storage.ts');
const jest = read('apps/api/src/files/storage/s3-object-storage.spec.ts');
const http = read('scripts/test-account-export-b86-s3-loopback.test.mjs');
const runner = read('scripts/run-account-export-b101-signed-http.mjs');
const verifier = read('scripts/testing/b87-s3-sigv4-verifier.mjs');
const tap = read('scripts/testing/b101-signed-http-tap.mjs');
const oldGuard = read('scripts/test-account-export-b104-guard.mjs');
const scripts = JSON.parse(read('package.json')).scripts;
const config = read('apps/api/src/config/runtime-environment.ts');
const ops = read('docs/operations/account-export-artifacts.md');

const from = adapter.indexOf('    createMultipartWriter(input: {', 1000);
const to = adapter.indexOf('    createUploadIntent(', from);
const writer = adapter.slice(from, to);
const underlying = writer.slice(writer.indexOf('const underlyingWriter:'),
  writer.indexOf('let pendingOperation:'));
const wrapper = writer.slice(writer.indexOf('let pendingOperation:'));

let pass = 0;
function check(name, verify) {
  verify();
  pass++;
  console.log('PASS ' + name);
}

check('B105 preserves B104 real writer state and its failure/abort semantics', () => {
  assert.ok(from > 0 && to > from);
  assert.match(writer, /let failed = false/u);
  assert.match(underlying, /failed = true/u);
  assert.match(underlying, /async abort\(\): Promise<void>/u);
  assert.match(underlying, /input\.deleteObjectOnAbort !== false/u);
});
check('B105 serializes write/complete/abort against a single operation tail', () => {
  assert.match(wrapper, /let pendingOperation: Promise<void> = Promise\.resolve\(\)/u);
  assert.match(wrapper, /const result = pendingOperation\.then\(operation\)/u);
  assert.match(wrapper, /pendingOperation = result\.then\(/u);
  assert.match(wrapper, /await underlyingWriter\.write\(snapshot\)/u);
  assert.match(wrapper, /return serialize\(\(\) => underlyingWriter\.complete\(\)\)/u);
  assert.match(wrapper, /return serialize\(\(\) => underlyingWriter\.abort\(\)\)/u);
});
check('B105 fences writes immediately after complete or abort request', () => {
  assert.match(wrapper, /completionRequested = true/u);
  assert.match(wrapper, /abortRequested = true/u);
  assert.match(wrapper, /completionRequested\s*\|\|\s*abortRequested\s*\|\|\s*completed\s*\|\|\s*aborted\s*\|\|\s*failed/u);
  assert.match(wrapper, /if \(abortRequested\)/u);
  assert.match(wrapper, /S3 multipart writer is no longer writable/u);
});
check('B105 snapshots mutable caller bytes before deferring signed PUT', () => {
  const copy = wrapper.indexOf('snapshot = Buffer.from(chunk)');
  const queue = wrapper.indexOf('return serialize(async () => {');
  assert.ok(copy >= 0 && queue > copy);
  assert.match(jest, /B105 snapshots queued mutable byte arrays/u);
});
check('B105 Jest exercises in-flight initiation, queued parts, failure, and one PUT', () => {
  for (const name of [
    'B105 serializes concurrent multipart writes',
    'B105 concurrent abort waits for multipart initiation',
    'B105 queues a failed part before complete',
    'B105 concurrent complete calls on one single PUT',
  ]) assert.ok(jest.includes(name), name);
  assert.match(jest, /private-b105-abort/u);
  assert.match(jest, /toEqual\(\[\s*'POST',\s*'PUT',\s*'DELETE',?\s*\]\)/u);
});
check('B105 real signed HTTP covers concurrent writes/abort/complete/failure', () => {
  for (const name of [
    'B105 concurrent signed writes',
    'B105 signed HTTP abort cannot overtake',
    'B105 signed HTTP concurrent complete',
    'B105 signed HTTP queued failure',
  ]) assert.ok(http.includes(name), name);
  assert.match(http, /verifyB87S3SigV4\(\{/u);
  assert.match(verifier, /timingSafeEqual/u);
  assert.match(http, /assert\.deepEqual\(bytes, Buffer\.concat\(\[a, b\]\)\)/u);
});
check('B105 requires all 32 TCP cases, preserving B104 and TAP anti-skips', () => {
  const names = [...http.matchAll(/test\('([^']+)'/gu)].map(m => m[1]);
  assert.equal(names.length, 61);
  assert.equal(new Set(names).size, 61);
  for (const id of ['B86 ', 'B87 ', 'B95 ', 'B96 ', 'B97 ', 'B99 ', 'B100 ',
    'B101 ', 'B102 ', 'B103 ', 'B104 ', 'B105 ']) {
    assert.ok(names.some(name => name.startsWith(id)), id);
  }
  assert.match(runner, /expectedNames\.length < 61/u);
  assert.match(runner, /'B104 ', 'B105 ', 'B106 '/u);
  assert.match(tap, /summary\.skipped !== 0/u);
  assert.match(oldGuard, /names\.length >= 28/u);
});
check('B105 standalone and lifecycle gates preserve private release HOLD', () => {
  assert.match(scripts['test:account-export-b105-concurrency'],
    /test-account-export-b105-guard\.mjs/u);
  assert.match(scripts['test:account-lifecycle-contract'],
    /test-account-export-b105-guard\.mjs/u);
  assert.match(config, /STUDY_PROGRESS_ENABLED must remain false in production/u);
  assert.match(ops, /## B105/u);
  assert.match(ops, /#353 HOLD/u);
});
console.log('B105 S3 writer operation serialization: ' + pass + '/8 guard checks PASS');
