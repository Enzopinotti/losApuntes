import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = path => readFileSync(new URL('../' + path, import.meta.url), 'utf8');
const root = 'apps/api/src/data-lifecycle/';
const predicate = read(root + 'domain/account-export-mongo-artifact-expiry.ts');
const store = read(root + 'mongo/mongo-account-export.store.ts');
const tests = read(root + 'mongo/mongo-account-export.store.spec.ts');
const replica = read('apps/api/src/study-progress/mongo/study-progress.mongo-int.spec.ts');
const processor = read(root + 'domain/account-export-processor.ts');
const pkg = JSON.parse(read('package.json'));
const config = read('apps/api/src/config/runtime-environment.ts');
const find = store.slice(store.indexOf('  async findExpiredArtifacts('),
  store.indexOf('  async retireExpiredArtifact('));
const retire = store.slice(store.indexOf('  async retireExpiredArtifact('),
  store.indexOf('  async hasFailed('));
let checks = 0;
function verify(title, fn) { fn(); checks++; console.log('PASS ' + title); }

verify('B85 expiry predicate is Mongo primary $$NOW and real BSON date', () => {
  assert.match(predicate, /\$eq: \[\{ \$type: '\$artifactExpiresAt' \}, 'date'\]/u);
  assert.match(predicate, /\$lte: \['\$artifactExpiresAt', '\$\$NOW'\]/u);
});
verify('B85 candidate scan uses both client index bound and primary expiry', () => {
  assert.match(find, /artifactExpiresAt: \{ \$lte: input\.now \}/u);
  assert.match(find, /\.\.\.accountExportArtifactExpiredOnMongoServer\(\)/u);
  assert.match(find, /state: 'completed'/u);
  assert.match(find, /artifactGeneration: \{ \$type: 'string' \}/u);
});
verify('B85 retirement CAS checks same exact generation and server expiry', () => {
  assert.match(retire, /artifactGeneration: input\.generation/u);
  assert.match(retire, /\$eq: input\.expiresAt/u);
  assert.match(retire, /\$lte: input\.now/u);
  assert.match(retire, /\.\.\.accountExportArtifactExpiredOnMongoServer\(\)/u);
});
verify('B85 unlink and cleanup intent still share the same transaction', () => {
  assert.match(retire, /await session\.withTransaction\(async \(\) => \{/u);
  assert.match(retire, /\$set: \{ artifactGeneration: null \}/u);
  assert.match(retire, /this\.orphanCleanup!\.updateOne\(/u);
  assert.match(retire, /\{ upsert: true, session \}/u);
});
verify('B85 no provider deletion in Mongo transaction', () => {
  assert.doesNotMatch(retire, /deleteArtifact\(/u);
  assert.match(processor, /await this\.orphans\.renewLease\(/u);
  assert.match(processor, /await this\.artifacts\.deleteArtifact\(/u);
});
verify('B85 Jest regression covers scan and failed skewed retirement', () => {
  assert.match(tests, /B85 selection still asks the primary/u);
  assert.match(tests, /B85 a skewed worker cannot retire/u);
  assert.match(tests, /accountExportArtifactExpiredOnMongoServer/u);
});
verify('B85 local Mongo replica cases prove retention and successful expiry', () => {
  assert.match(replica, /B85 protects an unexpired private artifact/u);
  assert.match(replica, /B85 due private artifact remains safely retireable/u);
  assert.match(replica, /expect\(durable\?\.artifactGeneration\)\.toBe\(generation\)/u);
  assert.match(replica, /expect\(await orphanJobs\.countDocuments\(\{ jobId: id, generation \}\)\)\.toBe\(\s*0,?\s*\)/u);
});
verify('B85 Node isolated and structural gates stay wired with B84/B83', () => {
  const suite = pkg.scripts['test:account-lifecycle-contract'];
  assert.match(suite, /test-account-export-b85-artifact-expiry\.test\.mjs/u);
  assert.match(suite, /test-account-export-b85-expiry-guard\.mjs/u);
  assert.match(suite, /test-account-export-b84-mongo-claim-guard\.mjs/u);
  assert.match(suite, /test-account-export-b83-mongo-clock-guard\.mjs/u);
});
verify('B85 production release stays held', () => {
  assert.match(config, /STUDY_PROGRESS_ENABLED must remain false in production/u);
  assert.match(read('docs/operations/account-export-artifacts.md'), /B85/u);
});
console.log('B85 referenced export expiry: ' + checks + ' structural contracts PASS');
