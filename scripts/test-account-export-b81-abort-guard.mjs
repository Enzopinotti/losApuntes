import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (path) => readFileSync(new URL('../' + path, import.meta.url), 'utf8');
const prefix = 'apps/api/src/';
const provider = read(prefix + 'files/storage/s3-object-storage.ts');
const providerTests = read(prefix + 'files/storage/s3-object-storage.spec.ts');
const artifact = read(prefix + 'data-lifecycle/storage/account-export-artifact-storage.ts');
const artifactTests = read(prefix + 'data-lifecycle/storage/account-export-artifact-storage.spec.ts');
const processor = read(prefix + 'data-lifecycle/domain/account-export-processor.ts');
const processorTests = read(prefix + 'data-lifecycle/domain/account-export-processor.spec.ts');
const claim = read(prefix + 'data-lifecycle/mongo/mongo-account-export.store.ts');
const s3Tests = read('scripts/test-account-export-b81-s3-abort.test.mjs');
const root = JSON.parse(read('package.json'));
const runbook = read('docs/operations/account-export-artifacts.md');

let count = 0;
function verify(label, check) { check(); count += 1; console.log('PASS ' + label); }

verify('S3 interface and implementation support a backward-compatible abort mode', () => {
  assert.equal((provider.match(/deleteObjectOnAbort\?: boolean;/gu) ?? []).length, 2);
  assert.match(provider, /if \(input\.deleteObjectOnAbort !== false\) \{\s*await deleteObject\(input\.objectKey\);\s*\}/u);
});
verify('private export adapter explicitly disables direct S3 object DELETE on abort', () => {
  assert.match(artifact, /deleteObjectOnAbort: false,/u);
  assert.match(artifactTests, /B81 always opts private artifacts out of the S3 writer direct-delete abort path/u);
  assert.match(artifactTests, /deleteObjectOnAbort: false/u);
});
verify('abort still cancels live multipart upload ID, never a bare object when disabled', () => {
  const abort = provider.slice(provider.indexOf('        async abort(): Promise<void>'));
  assert.match(abort, /request\('DELETE', \[\s*\['uploadId', currentUploadId\]/u);
  assert.ok(abort.indexOf("request('DELETE'") < abort.indexOf('if (input.deleteObjectOnAbort !== false)'));
});
verify('explicit deleteArtifact remains available only to owner-fenced cleanup', () => {
  const drain = processor.slice(
    processor.indexOf('  private async drainOrphanCleanup('),
    processor.indexOf('  private async deleteExpiredArtifacts('),
  );
  assert.match(artifact, /deleteArtifact\(jobId: string, generation: string\): Promise<void> \{\s*return this\.storage\.deleteObject\(objectKey\(jobId, generation\)\);/u);
  assert.match(drain, /findForOrphanCleanup\(candidate\.jobId\)/u);
  assert.match(drain, /job\.userId !== candidate\.ownerUserId/u);
  assert.match(drain, /job\.artifactGeneration === candidate\.generation/u);
  assert.match(drain, /await this\.orphans\.renewLease\(/u);
  assert.match(drain, /await this\.artifacts\.deleteArtifact\(/u);
});
verify('B80 durable claim is registered before private writer can stage S3', () => {
  assert.match(claim, /const writeAhead = planAccountExportClaimWriteAhead\(/u);
  assert.match(claim, /\{ \$setOnInsert: writeAhead \}/u);
  assert.match(claim, /\{ upsert: true, session \}/u);
  assert.match(claim, /claimed = await this\.jobs/u);
});
verify('processor continues queue-only cleanup after ambiguous multipart ACK', () => {
  assert.match(processor, /if \(!artifactCommitted\) \{/u);
  assert.match(processor, /await sink\.abort\(\)/u);
  assert.match(processor, /await this\.deleteOrEnqueueProvenOrphan\(job, claimId, result\);/u);
  assert.match(processorTests, /B71 queues S3 cleanup after multipart completion ACK is lost/u);
});
verify('real mocked HTTP regression tests cover PUT, multipart, legacy and active abort', () => {
  assert.match(s3Tests, /B81 single-part lost ACK/u);
  assert.match(s3Tests, /B81 multipart completion lost ACK/u);
  assert.match(s3Tests, /B81 default S3 consumer still deletes object/u);
  assert.match(s3Tests, /B81 active private multipart/u);
  assert.match(providerTests, /B81 never deletes a private export single-PUT/u);
  assert.match(providerTests, /B81 aborts only the private multipart upload ID/u);
  assert.match(providerTests, /aborts partial multipart data and deletes any generation object/u);
});
verify('root lifecycle actually invokes B81 runnable regression and safeguard', () => {
  const chain = root.scripts['test:account-lifecycle-contract'];
  assert.match(chain, /test-account-export-b81-s3-abort\.test\.mjs/u);
  assert.match(chain, /test-account-export-b81-abort-guard\.mjs/u);
  assert.match(chain, /test-account-export-b80-writeahead\.mjs/u);
});
verify('production release remains held and runbook documents multipart-only abort', () => {
  assert.match(runbook, /B81/u);
  const config = read(prefix + 'config/runtime-environment.ts');
  assert.match(config, /STUDY_PROGRESS_ENABLED must remain false in production/u);
});
console.log('B81 account export multipart abort: ' + count + ' structural safeguards PASS');
