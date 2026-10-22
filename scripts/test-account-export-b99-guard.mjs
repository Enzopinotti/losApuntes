import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = path => readFileSync(new URL('../' + path, import.meta.url), 'utf8');
const parser = read('apps/api/src/files/storage/s3-multipart-completion.ts');
const writer = read('apps/api/src/files/storage/s3-object-storage.ts');
const units = read('scripts/test-account-export-b99-multipart-xml.test.mjs');
const jest = read('apps/api/src/files/storage/s3-object-storage.spec.ts');
const http = read('scripts/test-account-export-b86-s3-loopback.test.mjs');
const scripts = JSON.parse(read('package.json')).scripts;
const ops = read('docs/operations/account-export-artifacts.md');

let passed = 0;
const check = (name, run) => { run(); passed++; console.log('PASS ' + name); };

check('B99 requires typed, shallow S3 result fields and ETag', () => {
  assert.match(parser, /RESULT_FIELDS = new Set/u);
  assert.match(parser, /etagSeen\s*&&\s*index === body\.length/u);
  assert.match(parser, /seenFields\.has\(tag\.name\)/u);
});
check('B99 validates closing tags and rejects nested markup', () => {
  assert.match(parser, /tag\.name !== activeField/u);
  assert.match(parser, /const tag = readTag\(body, index\)/u);
  assert.match(units, /rejects unclosed, mismatched, duplicate or nested/u);
});
check('B99 disallows markup or entity expansion in field values', () => {
  assert.match(parser, /validXmlText\(segment\)/u);
  assert.match(parser, /if \(!isDecimal && !isHex\) return false/u);
  assert.match(units, /rejects undefined named, unescaped/u);
});
check('B103 preserves B99 strict AWS envelope and removes legacy empty ACK', () => {
  assert.match(parser, /if \(tag\.selfClosing\) return false/u);
  assert.match(units, /accepts AWS envelope and checksums/u);
});
check('B99 uses B97 bounded read before semantic acceptance and writer commit', () => {
  const start = writer.indexOf('async complete(): Promise<void>');
  const end = writer.indexOf('async abort(): Promise<void>', start);
  const section = writer.slice(start, end);
  const bounded = section.indexOf('readBoundedS3MultipartCompletionXml(response)');
  const semantic = section.indexOf('isConfirmedS3MultipartCompletion(xml, {');
  const done = section.lastIndexOf('completed = true;');
  assert.ok(bounded > 0 && semantic > bounded && done > semantic);
});
check('B99 tests real writer and signed localhost HTTP without object deletion', () => {
  assert.match(jest, /B99 mismatched closing field/u);
  assert.match(jest, /B99 duplicate ETag/u);
  assert.match(http, /B99 signed HTTP rejects malformed success XML/u);
  assert.match(http, /calls\.some\(call => call\.method === 'DELETE' && !call\.uploadId\)/u);
});
check('B99 test is in standalone suite and lifecycle without bypassing previous suites', () => {
  assert.match(scripts['test:account-export-b99-xml'], /test-account-export-b99-multipart-xml\.test\.mjs/u);
  assert.match(scripts['test:account-lifecycle-contract'], /test-account-export-b97-guard\.mjs/u);
  assert.match(scripts['test:account-lifecycle-contract'], /test-account-export-b99-guard\.mjs/u);
});
check('B99 preserves private cleanup and release HOLD', () => {
  assert.match(writer, /input\.deleteObjectOnAbort !== false/u);
  assert.match(ops, /## B99/u);
  assert.match(ops, /#353 HOLD/u);
});
console.log('B99 strict multipart XML: ' + passed + '/' + passed + ' source checks PASS');
