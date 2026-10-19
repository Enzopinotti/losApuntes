import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = path => readFileSync(new URL('../' + path, import.meta.url), 'utf8');
const adapter = read('apps/api/src/files/storage/s3-object-storage.ts');
const jest = read('apps/api/src/files/storage/s3-object-storage.spec.ts');
const http = read('scripts/test-account-export-b86-s3-loopback.test.mjs');
const runner = read('scripts/run-account-export-b101-signed-http.mjs');
const tap = read('scripts/testing/b101-signed-http-tap.mjs');
const b104 = read('scripts/test-account-export-b104-guard.mjs');
const b105 = read('scripts/test-account-export-b105-guard.mjs');
const scripts = JSON.parse(read('package.json')).scripts;
const ops = read('docs/operations/account-export-artifacts.md');
const config = read('apps/api/src/config/runtime-environment.ts');

const begin = adapter.indexOf('    createMultipartWriter(input: {', 1000);
const end = adapter.indexOf('    createUploadIntent(', begin);
const writer = adapter.slice(begin, end);
const wrapper = writer.slice(writer.indexOf('let pendingOperation:'));
let passed = 0;
function check(name, fn) { fn(); passed++; console.log('PASS ' + name); }

check('B106 caps both outstanding snapshot bytes and number of calls per writer', () => {
  assert.ok(begin >= 0 && end > begin);
  assert.match(wrapper, /maximumQueuedSnapshotBytes = 16 \* 1024 \* 1024/u);
  assert.match(wrapper, /maximumQueuedWriteOperations = 32/u);
  assert.match(wrapper, /queuedSnapshotBytes = 0/u);
  assert.match(wrapper, /queuedWriteOperations = 0/u);
});

check('B106 refuses over-budget snapshots before allocating or adding queue work', () => {
  const budgetCheck = wrapper.search(/chunk\.byteLength\s*>\s*maximumQueuedSnapshotBytes\s*-\s*queuedSnapshotBytes/u);
  const operationCheck = wrapper.indexOf('queuedWriteOperations >= maximumQueuedWriteOperations');
  const copy = wrapper.indexOf('snapshot = Buffer.from(chunk)');
  const enqueue = wrapper.indexOf('return serialize(async () => {');
  assert.ok(budgetCheck >= 0 && operationCheck > budgetCheck);
  assert.ok(copy > operationCheck && enqueue > copy);
  assert.match(wrapper, /S3 multipart writer pending writes exceed limits/u);
});

check('B106 budget rejection poisons completion but leaves private abort available', () => {
  const overflowStart = wrapper.search(/if\s*\(\s*chunk\.byteLength\s*>/u);
  const overflowEnd = wrapper.indexOf('let snapshot: Buffer', overflowStart);
  assert.ok(overflowStart >= 0 && overflowEnd > overflowStart);
  const overflow = wrapper.slice(overflowStart, overflowEnd);
  assert.match(overflow, /failed = true/u);
  assert.match(writer, /S3 multipart writer cannot complete after a failed operation/u);
  assert.match(wrapper, /return serialize\(\(\) => underlyingWriter.abort\(\)\)/u);
  assert.match(writer, /input\.deleteObjectOnAbort !== false/u);
});

check('B106 releases budget and scrubs private snapshot bytes on every settlement', () => {
  assert.match(wrapper, /try \{\s*await underlyingWriter\.write\(snapshot\)/u);
  assert.match(wrapper, /finally \{/u);
  assert.match(wrapper, /snapshot\.fill\(0\)/u);
  assert.match(wrapper, /queuedSnapshotBytes -= snapshot\.byteLength/u);
  assert.match(wrapper, /queuedWriteOperations -= 1/u);
  assert.match(wrapper, /pendingOperation = result\.then\(/u);
});

check('B106 Jest covers oversize, pending burst, empty flood and sequential release', () => {
  for (const name of [
    'B106 rejects a chunk beyond the 16 MiB snapshot budget',
    'B106 over-budget queued writes cannot complete partial private export',
    'B106 bounds zero-byte queued calls by number',
    'B106 releases snapshot budget after each awaited write',
  ]) assert.ok(jest.includes(name), name);
  assert.match(jest, /deleteObjectOnAbort: false/u);
});

check('B106 SigV4 loopback ensures over-budget fail closed and uploadId-only abort', () => {
  assert.match(http, /B106 signed HTTP rejects oversized 16 MiB snapshot/u);
  assert.match(http, /B106 signed HTTP aborts over-budget queued writes/u);
  assert.match(http, /input\.onInitiation\?\.\(\)/u);
  assert.match(http, /assert\.deepEqual\(calls\.map\(call => call\.method\), \['POST', 'PUT', 'DELETE'\]\)/u);
  assert.match(http, /verifyB87S3SigV4\(\{/u);
});

check('B106 signed runner requires all 61 actual named cases without skips', () => {
  const names = [...http.matchAll(/test\('([^']+)'/gu)].map(m => m[1]);
  assert.equal(names.length, 61);
  assert.equal(new Set(names).size, 61);
  assert.ok(names.some(n => n.startsWith('B105 ')));
  assert.ok(names.some(n => n.startsWith('B106 ')));
  assert.match(runner, /expectedNames\.length < 61/u);
  assert.match(runner, /'B105 ', 'B106 '/u);
  assert.match(tap, /summary\.skipped !== 0/u);
  assert.match(b104, /names\.length >= 28/u);
  assert.match(b105, /names\.length, 61/u);
});

check('B106 lifecycle command, owner fences and release HOLD stay explicit', () => {
  assert.match(scripts['test:account-export-b106-bounded-queue'],
    /test-account-export-b106-guard\.mjs/u);
  assert.match(scripts['test:account-lifecycle-contract'],
    /test-account-export-b106-guard\.mjs/u);
  assert.match(config, /STUDY_PROGRESS_ENABLED must remain false in production/u);
  assert.match(ops, /## B106/u);
  assert.match(ops, /#353 HOLD/u);
});
console.log('B106 bounded S3 writer queue: ' + passed + '/8 source guards PASS');
