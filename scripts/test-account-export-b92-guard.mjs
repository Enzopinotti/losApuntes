import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = path => readFileSync(new URL('../' + path, import.meta.url), 'utf8');
const base = 'apps/api/src/data-lifecycle/';
const controller = read(base + 'account-export.controller.ts');
const specs = read(base + 'account-export.controller.spec.ts');
const helper = read(base + 'domain/account-export-download-reauthorization.ts');
const service = read(base + 'domain/account-export.service.ts');
const adapter = read(base + 'storage/account-export-artifact-storage.ts');
const nodeSuite = read('scripts/test-account-export-b92-reauthorization.test.mjs');
const scripts = JSON.parse(read('package.json')).scripts;
const ops = read('docs/operations/account-export-artifacts.md');
const config = read('apps/api/src/config/runtime-environment.ts');

let passed = 0;
function check(name, f) { f(); passed++; console.log('PASS ' + name); }
const initial = controller.indexOf('const artifact = await this.exports.download(');
const preflight = controller.indexOf('await this.artifacts.verifyReadable(');
const latest = controller.indexOf('latest = await this.exports.download(');
const headers = controller.indexOf(".header('content-type'");
const response = controller.indexOf('return reply.send(');

check('B92 initial owner authorization precedes S3', () => {
  assert.ok(initial > 0 && initial < preflight);
  assert.match(controller, /@UseGuards\(AuthSessionGuard\)/u);
});
check('B92 second authorization happens after full preflight', () => {
  assert.ok(preflight < latest);
  assert.match(controller, /reauthorizeAccountExportDownload\(artifact, latest\)/u);
});
check('B92 no headers or response until second authorization completes', () => {
  assert.ok(latest < headers && headers < response);
});
check('B92 rechecks account activity and TTL via canonical service', () => {
  assert.match(service, /async download\(/u);
  assert.match(service, /await this\.assertActiveAccount\(userId\)/u);
  assert.match(service, /await this\.store\.isOwnedArtifactCurrent\(\{/u);
});
check('B92 compares exact generation and bytes metadata', () => {
  assert.match(helper, /before\.generation !== after\.generation/u);
  assert.match(helper, /before\.formatVersion !== after\.formatVersion/u);
  assert.match(helper, /before\.byteLength !== after\.byteLength/u);
  assert.match(helper, /before\.sha256 !== after\.sha256/u);
});
check('B92 handles disappearance or expiry using stable owner-safe codes', () => {
  assert.match(controller, /authority === 'not_found'/u);
  assert.match(controller, /authority === 'not_ready'/u);
  assert.match(controller, /authority === 'expired'/u);
  assert.match(controller, /ACCOUNT_EXPORT_CHANGED_DURING_VERIFICATION/u);
});
check('B92 refused authorization cleans listeners and cancels HTTP stream', () => {
  assert.match(controller, /if \(authority !== 'unchanged' \|\| abort\.signal\.aborted\)/u);
  assert.match(controller, /cleanup\(\);\s*abort\.abort\(\);/u);
});
check('B92 service authorization failures are not converted to storage 503', () => {
  assert.match(controller, /catch \(error\) \{\s*cleanup\(\);\s*abort\.abort\(\);\s*throw error;/u);
});
check('B92 retains B91 preflight and post-send streaming digest', () => {
  assert.match(controller, /verifyAccountExportDownload\(/u);
  assert.match(adapter, /verifyReadable\(/u);
  assert.match(adapter, /verifyAccountExportStoredBytes\(/u);
});
check('B92 controller Jest covers expiry, metadata changes, account closure and disconnect', () => {
  assert.match(specs, /B92 fails closed if durable export becomes/u);
  assert.match(specs, /B92 refuses a changed/u);
  assert.match(specs, /B92 owner revocation during preflight/u);
  assert.match(specs, /B92 does not send if connection closes/u);
});
check('B92 dependency-free Node suite covers nine authorization vectors', () => {
  assert.equal((nodeSuite.match(/test\('/gu) ?? []).length, 9);
  assert.match(nodeSuite, /B92 expiry during full S3 preflight/u);
});
check('B92 is wired into account lifecycle with B91 still present', () => {
  const chain = scripts['test:account-lifecycle-contract'];
  assert.match(chain, /test-account-export-b91-download-preflight\.test\.mjs/u);
  assert.match(chain, /test-account-export-b92-reauthorization\.test\.mjs/u);
  assert.match(chain, /test-account-export-b92-guard\.mjs/u);
});
check('B92 remains release-blocked', () => {
  assert.match(config, /STUDY_PROGRESS_ENABLED must remain false in production/u);
  assert.match(ops, /## B92/u);
});
console.log('B92 private download reauthorization: ' + passed + ' source contracts PASS');
