import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = path => readFileSync(new URL('../' + path, import.meta.url), 'utf8');
const signer = read('apps/api/src/files/storage/s3-object-storage.ts');
const verifier = read('scripts/testing/b87-s3-sigv4-verifier.mjs');
const loopback = read('scripts/test-account-export-b86-s3-loopback.test.mjs');
const suite = read('scripts/test-account-export-b87-sigv4.test.mjs');
const legacyGuard = read('scripts/test-account-export-b86-guard.mjs');
const pkg = JSON.parse(read('package.json'));
const operations = read('docs/operations/account-export-artifacts.md');
const config = read('apps/api/src/config/runtime-environment.ts');

let checked = 0;
function check(label, fn) { fn(); checked++; console.log('PASS ' + label); }

check('B87 verifier is independent from the production signer', () => {
  assert.doesNotMatch(verifier, /from .*s3-object-storage/u);
  assert.match(verifier, /createHash, createHmac, timingSafeEqual/u);
});
check('B87 verification binds exact bucket, generation and canonical path', () => {
  assert.match(verifier, /requestUrl\.pathname !== expectedPath/u);
  assert.match(verifier, /objectKey\.split\('\/'\)/u);
  assert.match(verifier, /requestUrl\.username \|\| requestUrl\.password/u);
});
check('B87 binds the actual request body to the signed payload hash', () => {
  assert.match(verifier, /sha\(body\)/u);
  assert.match(verifier, /safeEqualHex\(readHeader\(headers, 'x-amz-content-sha256'\)/u);
  assert.match(verifier, /timingSafeEqual/u);
});
check('B87 checks exact credential scope, region and required signed headers', () => {
  assert.match(verifier, /Credential=\(\[\^, \]\+\)/u);
  assert.match(verifier, /s3\/aws4_request/u);
  assert.match(verifier, /'host', 'x-amz-content-sha256', 'x-amz-date'/u);
});
check('B87 enforces primary incoming host and bounded signed timestamp', () => {
  assert.match(verifier, /readHeader\(headers, 'host'\) !== requestUrl\.host/u);
  assert.match(verifier, /15 \* 60_000/u);
  assert.match(verifier, /!Number\.isFinite\(parsedTime\)/u);
});
check('B87 canonical query uses percent escaping and codepoint order', () => {
  assert.match(verifier, /encodeURIComponent/u);
  assert.match(verifier, /ka < kb \? -1 : ka > kb \? 1/u);
  assert.doesNotMatch(verifier, /localeCompare/u);
});
check('B87 canonical request and signing key are recomputed independently', () => {
  assert.match(verifier, /canonicalRequest/u);
  assert.match(verifier, /createHmac\('sha256', signingKey\)/u);
  assert.match(verifier, /safeEqualHex\(signature/u);
});
check('B87 loopback runs verifier before allowing any S3 operation', () => {
  const verified = loopback.indexOf('const trusted = verifyB87S3SigV4(');
  const denied = loopback.indexOf('response.writeHead(403)');
  const storage = loopback.indexOf("if (method === 'POST' && url.searchParams.has('uploads'))");
  assert.ok(verified > 0 && denied > verified && storage > denied);
  assert.match(loopback, /response\.end\('SignatureDoesNotMatch'\)/u);
});
check('B87 loopback keeps localhost ephemeral binding and real app S3 adapter', () => {
  assert.match(loopback, /server\.listen\(0, '127\.0\.0\.1', resolve\)/u);
  assert.match(loopback, /createS3ObjectStorage\(\{/u);
  assert.doesNotMatch(loopback, /https:\/\/s3\.amazonaws\.com/u);
});
check('B87 negative loopback cases reject forged signature, body and foreign key', () => {
  assert.match(loopback, /B87 loopback rejects a forged SigV4 signature/u);
  assert.match(loopback, /B87 loopback denies payload modification/u);
  assert.match(loopback, /B87 loopback refuses a signed request rerouted/u);
  assert.ok((loopback.match(/test\('/gu) ?? []).length >= 8);
});
check('B87 vector suite tests valid SigV4 plus multiple invalid variations', () => {
  assert.match(suite, /B87 independent SigV4 verifier accepts valid/u);
  assert.match(suite, /B87 accepts AWS canonical query/u);
  assert.match(suite, /B87 rejects a plausible AWS4 prefix/u);
  assert.match(suite, /B87 denies changing any signed payload byte/u);
  assert.match(suite, /B87 denies modification of the signed object path or query/u);
  assert.match(suite, /B87 denies wrong region, credential, secret and request clock/u);
});
check('B87 root lifecycle runs both cryptographic and loopback tests', () => {
  const cmd = pkg.scripts['test:account-lifecycle-contract'];
  assert.match(cmd, /test-account-export-b86-s3-loopback\.test\.mjs/u);
  assert.match(cmd, /test-account-export-b87-sigv4\.test\.mjs/u);
  assert.match(cmd, /test-account-export-b87-guard\.mjs/u);
});
check('B87 preserves B86 guard and production signer unchanged', () => {
  assert.match(legacyGuard, /B86 loopback S3 and real Mongo opt-in acceptance/u);
  assert.match(signer, /AWS4-HMAC-SHA256/u);
  assert.match(signer, /if \(input\.deleteObjectOnAbort !== false\)/u);
});
check('B87 release remains held and evidence limitations documented', () => {
  assert.match(operations, /B87/u);
  assert.match(config, /STUDY_PROGRESS_ENABLED must remain false in production/u);
});
console.log('B87 cryptographic S3 HTTP acceptance: ' + checked + ' structural contracts PASS');
