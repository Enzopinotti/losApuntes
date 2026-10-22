import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = path => readFileSync(new URL('../' + path, import.meta.url), 'utf8');
const base = 'apps/api/src/data-lifecycle/';
const controller = read(base + 'account-export.controller.ts');
const controllerTests = read(base + 'account-export.controller.spec.ts');
const adapter = read(base + 'storage/account-export-artifact-storage.ts');
const adapterTests = read(base + 'storage/account-export-artifact-storage.spec.ts');
const readback = read(base + 'domain/account-export-artifact-readback.ts');
const streaming = read(base + 'storage/account-export-download-integrity.ts');
const service = read(base + 'domain/account-export.service.ts');
const scripts = JSON.parse(read('package.json')).scripts;
const runbook = read('docs/operations/account-export-artifacts.md');

let verified = 0;
function check(name, fn) { fn(); verified++; console.log('PASS ' + name); }

check('B91 preserves authenticated owner authorization before any artifact IO', () => {
  const owner = controller.indexOf('await this.exports.download(request.user.id, id)');
  const preflight = controller.indexOf('await this.artifacts.verifyReadable(');
  assert.ok(owner > 0 && preflight > owner);
  assert.match(controller, /@UseGuards\(AuthSessionGuard\)/u);
});
check('B91 validates generation and digest metadata before preflight', () => {
  const metadata = controller.indexOf('!artifact.generation');
  const preflight = controller.indexOf('await this.artifacts.verifyReadable(');
  assert.ok(metadata > 0 && preflight > metadata);
  assert.match(controller, /!\/\^\[a-f0-9\]\{64\}\$\/u\.test\(artifact\.sha256\)/u);
});
check('B91 attaches disconnect abort before starting full-object preflight', () => {
  const close = controller.indexOf("reply.raw.once('close', onClose)");
  const preflight = controller.indexOf('await this.artifacts.verifyReadable(');
  assert.ok(close > 0 && preflight > close);
  assert.match(controller, /abort\.signal/u);
});
check('B91 does not set headers or send private chunks before preflight succeeds', () => {
  const preflight = controller.indexOf('await this.artifacts.verifyReadable(');
  const contentType = controller.indexOf(".header('content-type'");
  const send = controller.indexOf('return reply.send(');
  assert.ok(preflight > 0 && preflight < contentType && contentType < send);
});
check('B91 stable storage outage maps to 503 without exposing S3 identifiers', () => {
  assert.match(controller, /new ServiceUnavailableException\(\{/u);
  assert.match(controller, /ACCOUNT_EXPORT_STORAGE_UNAVAILABLE/u);
  assert.match(controller, /cleanup\(\);\s*abort\.abort\(\);/u);
  assert.doesNotMatch(controller, /throw error;\s*\/\/ S3/u);
});
check('B91 retains post-preflight streaming digest and cancellation', () => {
  assert.match(controller, /verifyAccountExportDownload\(/u);
  assert.match(streaming, /hash\.digest\('hex'\) !== expectedSha256/u);
  assert.match(streaming, /if \(signal\?\.aborted\)/u);
});
check('B91 adapter reuses the production bounded streaming readback B90', () => {
  assert.match(adapter, /verifyReadable\(/u);
  assert.match(adapter, /return verifyAccountExportStoredBytes\(/u);
  assert.match(adapter, /this\.readObjectChunks\(jobId, generation, signal\)/u);
  assert.match(readback, /chunk\.byteLength > expected\.byteLength - bytesRead/u);
  assert.doesNotMatch(readback, /Buffer\.concat\(/u);
});
check('B91 preflight has no delete side effects or object-wide memory cache', () => {
  const i = adapter.indexOf('  verifyReadable(');
  const j = adapter.indexOf('  deleteArtifact(', i);
  assert.ok(i > 0 && j > i);
  assert.doesNotMatch(adapter.slice(i, j), /deleteObject\(/u);
  assert.doesNotMatch(adapter.slice(i, j), /Buffer\.concat\(/u);
});
check('B91 tests include block-until-preflight, stable 503 and client close', () => {
  assert.match(controllerTests, /B91 preflights exact owner and generation/u);
  assert.match(controllerTests, /B91 refuses an unverified/u);
  assert.match(controllerTests, /B91 aborts a disconnected client/u);
  assert.match(controllerTests, /expect\(reply\.header\.mock\.calls\)\.toHaveLength\(0\)/u);
});
check('B91 adapter tests cover corruption, truncation and provider errors', () => {
  assert.match(adapterTests, /B91 preflight accepts only exact-generation/u);
  assert.match(adapterTests, /B91 preflight fails closed/u);
  assert.match(adapterTests, /SHA-256 mismatch/u);
});
check('B91 status, expiration, version and active account guards stay intact', () => {
  assert.match(service, /async download\(/u);
  assert.match(service, /await this\.assertActiveAccount\(userId\)/u);
  assert.match(controller, /new GoneException\(/u);
  assert.match(controller, /new ConflictException\(/u);
});
check('B91 standalone model and guard run in lifecycle regression', () => {
  const lifecycle = scripts['test:account-lifecycle-contract'];
  assert.match(lifecycle, /test-account-export-b91-download-preflight\.test\.mjs/u);
  assert.match(lifecycle, /test-account-export-b91-preflight-guard\.mjs/u);
  assert.match(lifecycle, /test-account-export-b90-readback\.test\.mjs/u);
});
check('B91 HOLD and cost/remaining second-GET risk recorded', () => {
  assert.match(runbook, /## B91/u);
  assert.match(runbook, /#353 HOLD/u);
});
console.log('B91 private export download preflight: ' + verified + ' source contracts PASS');
