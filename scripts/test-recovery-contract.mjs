import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = (relativePath) =>
  readFile(new URL(`../${relativePath}`, import.meta.url), 'utf8');

const [backup, restore, gate, library, verifier, docs] = await Promise.all([
  read('scripts/recovery/backup-set.mjs'),
  read('scripts/recovery/restore-set.mjs'),
  read('scripts/recovery/check-recovery-point.mjs'),
  read('scripts/recovery/recovery-lib.mjs'),
  read('apps/api/src/ops/recovery-verify.cli.ts'),
  read('docs/operations/recovery.md'),
]);

assert.match(backup, /BACKUP_QUIESCED/u);
assert.match(backup, /application-quiesced/u);
assert.match(backup, /withMongoConfig/u);
assert.match(backup, /--config=/u);
assert.doesNotMatch(backup, /--uri=/u);
assert.match(backup, /verifyBackupSet/u);
assert.match(backup, /rename\(partialDirectory, finalDirectory\)/u);

assert.match(restore, /assertNonProductionTarget/u);
assert.match(
  restore,
  /I_HAVE_VERIFIED_THIS_TARGET_IS_NON_PRODUCTION/u,
);
assert.match(restore, /RESTORE:\$\{manifest\.backupSetId\}/u);
assert.match(restore, /RESTORE_ALLOW_DELETE/u);
assert.match(restore, /--drop/u);
assert.match(restore, /--stopOnError/u);
assert.match(restore, /--delete/u);
assert.match(restore, /withMongoConfig/u);
assert.doesNotMatch(restore, /--uri=/u);

assert.match(gate, /RECOVERY_EXPECTED_SOURCE_SHA/u);
assert.match(gate, /RECOVERY_MAX_AGE_HOURS/u);
assert.match(gate, /EMPTY_DATABASE_AND_EMPTY_FILES_CONFIRMED/u);
assert.match(gate, /verifyBackupSet/u);

assert.match(library, /backup\/recovery artifacts must live outside the repository/u);
assert.match(library, /mode: 0o600/u);
assert.match(verifier, /resource:\$\{resource\.id\}/u);
assert.match(verifier, /scanCompletedAt/u);
assert.match(verifier, /scanEngine/u);
assert.match(verifier, /storage\.headObject/u);
assert.doesNotMatch(verifier, /console\.(?:log|error)\([^)]*(?:objectKey|mongoUri|secretAccessKey)/u);

assert.match(docs, /off-host/iu);
assert.match(docs, /RPO/u);
assert.match(docs, /RTO/u);
assert.match(docs, /RESTORE_NONPRODUCTION_ACK/u);

console.log('PASS recovery safety and evidence contract');
