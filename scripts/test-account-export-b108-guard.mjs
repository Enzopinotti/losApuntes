import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = path => readFileSync(new URL('../' + path, import.meta.url), 'utf8');
const parser = read('apps/api/src/files/storage/s3-multipart-part-etag.ts');
const writer = read('apps/api/src/files/storage/s3-object-storage.ts');
const jest = read('apps/api/src/files/storage/s3-object-storage.spec.ts');
const native = read('scripts/test-account-export-b108-part-etag.test.mjs');
const http = read('scripts/test-account-export-b86-s3-loopback.test.mjs');
const runner = read('scripts/run-account-export-b101-signed-http.mjs');
const b107 = read('scripts/test-account-export-b107-guard.mjs');
const gate = read('scripts/testing/b107-node-gate.mjs');
const pkg = JSON.parse(read('package.json')).scripts;
const ops = read('docs/operations/account-export-artifacts.md');
const config = read('apps/api/src/config/runtime-environment.ts');

let count = 0;
function check(name, action) { action(); count++; console.log('PASS ' + name); }

check('B108 validates a bounded ETag header before making XML parts', () => {
  assert.match(parser, /raw\.length > 256/u);
  assert.match(parser, /startsQuote !== endsQuote/u);
  assert.match(parser, /token\.length > 254/u);
  assert.match(parser, /token\.includes\('"'\)/u);
  assert.match(parser, /token\.includes\('\\\\'\)/u);
});
check('B108 rejects malformed controls, whitespace and non-ASCII ETags', () => {
  assert.match(parser, /point <= 31 \|\| point === 127/u);
  assert.match(parser, /\\x21-\\x7e/u);
  assert.match(native, /malformed or unmatched quotes/u);
  assert.match(native, /invalid HTTP whitespace and control characters/u);
  assert.match(native, /oversized ETags/u);
});
check('B108 caller does not strip unmatched quotes or trust raw part headers', () => {
  assert.match(writer, /import \{ normalizeS3MultipartPartEtag \} from '\.\/s3-multipart-part-etag'/u);
  assert.match(writer, /normalizeS3MultipartPartEtag\(response\.headers\.get\('etag'\)\)/u);
  assert.doesNotMatch(writer, /rawEtag\?\.replace\(/u);
  assert.match(writer, /etag: \x60"\$\{xmlEscape\(etag\)\}"\x60/u);
});
check('B108 invalid part ETag fails closed and preserves owner-safe abort', () => {
  const begin = writer.indexOf('    createMultipartWriter(input: {', 1000);
  const end = writer.indexOf('    createUploadIntent(', begin);
  const scope = writer.slice(begin, end);
  assert.match(scope, /throw new Error\('S3 multipart part returned an invalid ETag'\)/u);
  assert.match(scope, /failed = true/u);
  assert.match(scope, /S3 multipart writer cannot complete after a failed operation/u);
  assert.match(scope, /input\.deleteObjectOnAbort !== false/u);
  assert.match(scope, /const currentUploadId = uploadId/u);
});
check('B108 Jest covers invalid UploadPart ACK and XML escaped positive', () => {
  assert.match(jest, /B108 rejects invalid UploadPart ETag/u);
  assert.match(jest, /B108 keeps unquoted opaque provider ETags/u);
  assert.match(jest, /S3 multipart part returned an invalid ETag/u);
  assert.match(jest, /<ETag>"opaque&amp;compatible"<\/ETag>/u);
});
check('B108 actual signed localhost fixture now checks corrupt and compatible part ETags', () => {
  assert.match(http, /input\.partEtag \?\? '"b86-part-etag"'/u);
  assert.match(http, /B108 signed HTTP rejects malformed UploadPart ETags/u);
  assert.match(http, /B108 signed HTTP supports a bounded unquoted compatible part ETag/u);
  assert.match(http, /verifyB87S3SigV4\(\{/u);
});
check('B108 signed release runner requires all 61 unique tests under Node24', () => {
  const names = [...http.matchAll(/test\('([^']+)'/gu)].map(m => m[1]);
  assert.equal(names.length, 61);
  assert.equal(new Set(names).size, 61);
  assert.ok(names.some(n => n.startsWith('B108 ')));
  assert.match(runner, /expectedNames\.length < 61/u);
  assert.match(runner, /'B106 ', 'B108 '/u);
  assert.match(gate, /nodeMajor === 24 && argumentsList\.length === 0/u);
  assert.match(b107, /names\.length, 61/u);
});
check('B108 source is in lifecycle and release authority remains HOLD', () => {
  assert.match(pkg['test:account-export-b108-part-etag'], /test-account-export-b108-part-etag\.test\.mjs/u);
  assert.match(pkg['test:account-lifecycle-contract'], /test-account-export-b108-guard\.mjs/u);
  assert.match(config, /STUDY_PROGRESS_ENABLED must remain false in production/u);
  assert.match(ops, /## B108/u);
  assert.match(ops, /#353 HOLD/u);
});
console.log('B108 UploadPart ETag validation: ' + count + '/8 guards PASS');
