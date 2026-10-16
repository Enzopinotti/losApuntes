import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = path => readFileSync(new URL('../' + path, import.meta.url), 'utf8');
const root = 'apps/api/src/data-lifecycle/';
const primary = read(root + 'domain/account-export-mongo-download-clock.ts');
const cleanup = read(root + 'domain/account-export-mongo-artifact-expiry.ts');
const store = read(root + 'mongo/mongo-account-export.store.ts');
const interfaceSource = read(root + 'domain/account-export.store.ts');
const service = read(root + 'domain/account-export.service.ts');
const storeTests = read(root + 'mongo/mongo-account-export.store.spec.ts');
const serviceTests = read(root + 'domain/account-export.service.spec.ts');
const mongo = read('apps/api/src/study-progress/mongo/study-progress.mongo-int.spec.ts');
const pkg = JSON.parse(read('package.json')).scripts;
const ops = read('docs/operations/account-export-artifacts.md');
const config = read('apps/api/src/config/runtime-environment.ts');

let passed = 0;
function check(name, fn) { fn(); passed++; console.log('PASS ' + name); }
check('B93 primary query is strictly before expiry with BSON Date type', () => {
  assert.match(primary, /\$gt: \['\$artifactExpiresAt', '\$\$NOW'\]/u);
  assert.match(primary, /\$type: '\$artifactExpiresAt'/u);
  assert.match(cleanup, /\$lte: \['\$artifactExpiresAt', '\$\$NOW'\]/u);
});
check('B93 owner scoped store authorization is an independent Mongo primary read', () => {
  const start = store.indexOf('  async isOwnedArtifactCurrent(');
  const end = store.indexOf('  async findForOrphanCleanup(', start);
  const source = store.slice(start, end);
  assert.ok(start > 0 && end > start);
  assert.match(source, /this\.jobs\.exists\(\{/u);
  assert.match(source, /id: input\.id/u);
  assert.match(source, /userId: input\.userId/u);
  assert.match(source, /artifactGeneration: input\.generation/u);
  assert.match(source, /artifactExpiresAt: input\.expiresAt/u);
  assert.match(source, /accountExportArtifactLiveOnMongoServer\(\)/u);
  assert.match(source, /return Boolean\(eligible\)/u);
});
check('B93 mandatory store contract enforces owner and exact-generation parameters', () => {
  assert.match(interfaceSource, /isOwnedArtifactCurrent\(input:/u);
  assert.match(interfaceSource, /generation: string/u);
  assert.match(interfaceSource, /expiresAt: Date/u);
});
check('B93 status has an authoritative primary-time downloadable flag', () => {
  const status = service.slice(service.indexOf('  async status('), service.indexOf('  async download('));
  assert.match(status, /await this\.store\.isOwnedArtifactCurrent\(\{/u);
  assert.match(status, /this\.publicStatus\(job, now, liveOnPrimary\)/u);
});
check('B93 download checks owner and exact record before server-clock eligibility', () => {
  const part = service.slice(service.indexOf('  async download('), service.indexOf('  async claimNext('));
  assert.match(part, /this\.assertActiveAccount\(userId\)/u);
  assert.match(part, /this\.store\.findOwned\(id, userId\)/u);
  assert.match(part, /await this\.store\.isOwnedArtifactCurrent\(\{/u);
  assert.match(part, /return \{ kind: 'expired' \}/u);
  assert.doesNotMatch(part, /job\.artifactExpiresAt\.getTime\(\) <= now\.getTime\(\)/u);
});
check('B93 never exposes unverified generation from the query', () => {
  const part = service.slice(service.indexOf('  async download('), service.indexOf('  async claimNext('));
  assert.ok(part.indexOf('await this.store.isOwnedArtifactCurrent(') <
    part.indexOf("kind: 'available'"));
});
check('B93 does not affect B90-B92 S3 and controller safety guards', () => {
  const controller = read(root + 'account-export.controller.ts');
  assert.match(controller, /reauthorizeAccountExportDownload\(artifact, latest\)/u);
  assert.match(controller, /await this\.artifacts\.verifyReadable\(/u);
  assert.match(controller, /verifyAccountExportDownload\(/u);
});
check('B93 tests include real-primary opt-in and skew/outage unit cases', () => {
  assert.match(serviceTests, /B93 status uses the Mongo primary/u);
  assert.match(serviceTests, /B93 status and download deny expiry/u);
  assert.match(serviceTests, /B93 fails closed if the primary eligibility probe fails/u);
  assert.match(storeTests, /B93 probes only the current exact owner/u);
  assert.match(mongo, /B93 Mongo primary authorizes a future artifact/u);
  assert.match(mongo, /B93 Mongo primary refuses expired and detached/u);
});
check('B93 executable and structural suites are wired into lifecycle chain', () => {
  const chain = pkg['test:account-lifecycle-contract'];
  assert.match(chain, /test-account-export-b93-mongo-download-clock\.test\.mjs/u);
  assert.match(chain, /test-account-export-b93-mongo-download-guard\.mjs/u);
  assert.match(chain, /test-account-export-b92-reauthorization\.test\.mjs/u);
});
check('B93 release stays held', () => {
  assert.match(config, /STUDY_PROGRESS_ENABLED must remain false in production/u);
  assert.match(ops, /## B93/u);
});
console.log('B93 Mongo primary private download authorization: ' + passed + ' source checks PASS');
