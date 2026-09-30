import {
  mkdir,
  realpath,
} from 'node:fs/promises';
import path from 'node:path';

import {
  assertArtifactRootOutsideRepo,
  assertBucketName,
  assertNonProductionTarget,
  assertRootEndpoint,
  existingDirectory,
  requireEnv,
  runCommand,
  verifyBackupSet,
  withMongoConfig,
  writeJsonAtomic,
} from './recovery-lib.mjs';

const NONPRODUCTION_ACK =
  'I_HAVE_VERIFIED_THIS_TARGET_IS_NON_PRODUCTION';

async function main() {
  const setDirectory = assertArtifactRootOutsideRepo(
    await existingDirectory(requireEnv('BACKUP_SET_DIR', 4096)),
  );
  const { manifest, mongoPath, filesPath, inventory } =
    await verifyBackupSet(setDirectory);

  const targetEnvironment = assertNonProductionTarget(
    requireEnv('RESTORE_TARGET_ENV', 64),
  );
  if (process.env.RESTORE_NONPRODUCTION_ACK?.trim() !== NONPRODUCTION_ACK) {
    throw new Error(
      `RESTORE_NONPRODUCTION_ACK must equal ${NONPRODUCTION_ACK}`,
    );
  }
  if (
    process.env.RESTORE_CONFIRM?.trim() !==
    `RESTORE:${manifest.backupSetId}`
  ) {
    throw new Error(
      'RESTORE_CONFIRM must name the exact backup set being restored',
    );
  }
  if (process.env.RESTORE_ALLOW_DELETE?.trim().toLowerCase() !== 'true') {
    throw new Error(
      'RESTORE_ALLOW_DELETE=true is required because restore replaces target data',
    );
  }

  const mongoUri = requireEnv('RESTORE_MONGO_URI');
  const endpoint = assertRootEndpoint(
    requireEnv('RESTORE_FILES_ENDPOINT', 2048),
    'RESTORE_FILES_ENDPOINT',
  );
  const bucket = assertBucketName(
    requireEnv('RESTORE_FILES_BUCKET', 255),
    'RESTORE_FILES_BUCKET',
  );

  const requestedEvidenceRoot = assertArtifactRootOutsideRepo(
    requireEnv('RECOVERY_EVIDENCE_ROOT', 4096),
  );
  await mkdir(requestedEvidenceRoot, {
    recursive: true,
    mode: 0o700,
  });
  const evidenceRoot = assertArtifactRootOutsideRepo(
    await realpath(requestedEvidenceRoot),
  );

  const restoredAt = new Date();

  await withMongoConfig(mongoUri, async (configPath) => {
    runCommand('mongorestore', [
      `--config=${configPath}`,
      `--archive=${mongoPath}`,
      '--gzip',
      '--drop',
      '--stopOnError',
      '--quiet',
    ]);
  });

  runCommand('aws', [
    '--endpoint-url',
    endpoint,
    's3',
    'sync',
    filesPath,
    `s3://${bucket}`,
    '--delete',
    '--only-show-errors',
  ]);

  for (const row of inventory) {
    const rawSize = runCommand('aws', [
      '--endpoint-url',
      endpoint,
      's3api',
      'head-object',
      '--bucket',
      bucket,
      '--key',
      row.key,
      '--query',
      'ContentLength',
      '--output',
      'text',
    ]);
    const remoteSize = Number(rawSize);
    if (!Number.isSafeInteger(remoteSize) || remoteSize !== row.byteSize) {
      throw new Error('restored Files object size does not match backup inventory');
    }
  }

  const remainingChanges = runCommand('aws', [
    '--endpoint-url',
    endpoint,
    's3',
    'sync',
    filesPath,
    `s3://${bucket}`,
    '--delete',
    '--dryrun',
  ]);
  if (remainingChanges.trim()) {
    throw new Error('restored Files bucket does not converge to backup inventory');
  }

  const evidence = {
    formatVersion: 1,
    kind: 'restore-materialization',
    status: 'PASS',
    backupSetId: manifest.backupSetId,
    sourceReleaseSha: manifest.releaseSha,
    schemaVersion: manifest.schemaVersion,
    targetEnvironment,
    restoredAt: restoredAt.toISOString(),
    checks: {
      backupSetIntegrity: 'pass',
      mongoRestore: 'pass',
      filesRestore: 'pass',
      filesObjectCount: inventory.length,
    },
  };
  const timestamp = restoredAt
    .toISOString()
    .replace(/[-:]/gu, '')
    .replace(/\.\d{3}Z$/u, 'Z');
  const evidencePath = path.join(
    evidenceRoot,
    `restore-${manifest.backupSetId}-${timestamp}.json`,
  );
  await writeJsonAtomic(evidencePath, evidence);

  console.log(
    JSON.stringify({
      event: 'recovery.restore.completed',
      status: 'PASS',
      backupSetId: manifest.backupSetId,
      sourceReleaseSha: manifest.releaseSha,
      targetEnvironment,
      objectCount: inventory.length,
    }),
  );
}

void main().catch((error) => {
  console.error(
    JSON.stringify({
      event: 'recovery.restore.failed',
      errorType: error instanceof Error ? error.name : 'UnknownError',
    }),
  );
  process.exitCode = 1;
});
