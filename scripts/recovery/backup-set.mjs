import {
  access,
  mkdir,
  realpath,
  rename,
  rm,
  stat,
} from 'node:fs/promises';
import path from 'node:path';

import {
  RECOVERY_FORMAT_VERSION,
  acquireDirectoryLock,
  assertArtifactRootOutsideRepo,
  assertBackupSetId,
  assertBucketName,
  assertEnvironmentLabel,
  assertReleaseSha,
  assertRootEndpoint,
  assertSchemaVersion,
  generatedBackupSetId,
  inventoryDirectory,
  optionalEnv,
  requireEnv,
  runCommand,
  sha256File,
  toolVersion,
  verifyBackupSet,
  withMongoConfig,
  writeInventory,
  writeJsonAtomic,
} from './recovery-lib.mjs';

async function exists(filename) {
  try {
    await access(filename);
    return true;
  } catch {
    return false;
  }
}

async function main() {
  if (process.env.BACKUP_QUIESCED?.trim().toLowerCase() !== 'true') {
    throw new Error(
      'BACKUP_QUIESCED=true is required; backup refuses a live write window',
    );
  }

  const releaseSha = assertReleaseSha(requireEnv('RELEASE_SHA', 40));
  const sourceEnvironment = assertEnvironmentLabel(
    requireEnv('BACKUP_SOURCE_ENV', 64),
    'BACKUP_SOURCE_ENV',
  );
  const schemaVersion = assertSchemaVersion(
    requireEnv('BACKUP_SCHEMA_VERSION', 96),
  );
  const mongoUri = requireEnv('BACKUP_MONGO_URI');
  const endpoint = assertRootEndpoint(
    requireEnv('BACKUP_FILES_ENDPOINT', 2048),
    'BACKUP_FILES_ENDPOINT',
  );
  const bucket = assertBucketName(
    requireEnv('BACKUP_FILES_BUCKET', 255),
    'BACKUP_FILES_BUCKET',
  );

  const requestedRoot = assertArtifactRootOutsideRepo(
    requireEnv('BACKUP_ROOT', 4096),
  );
  await mkdir(requestedRoot, { recursive: true, mode: 0o700 });
  const root = assertArtifactRootOutsideRepo(await realpath(requestedRoot));

  const now = new Date();
  const backupSetId = assertBackupSetId(
    optionalEnv('BACKUP_SET_ID', 96) ??
      generatedBackupSetId(now, releaseSha),
  );
  const finalDirectory = path.join(root, backupSetId);
  const partialDirectory = path.join(root, `.${backupSetId}.partial`);
  const lockPath = path.join(root, '.locks', backupSetId);
  const releaseLock = await acquireDirectoryLock(lockPath);

  try {
    if (await exists(finalDirectory)) {
      const existing = await verifyBackupSet(finalDirectory);
      if (
        existing.manifest.releaseSha !== releaseSha ||
        existing.manifest.schemaVersion !== schemaVersion ||
        existing.manifest.sourceEnvironment !== sourceEnvironment
      ) {
        throw new Error(
          'existing backup set id belongs to different release/schema/environment metadata',
        );
      }

      console.log(
        JSON.stringify({
          event: 'recovery.backup.reused',
          backupSetId,
          releaseSha,
          objectCount: existing.manifest.files.objectCount,
        }),
      );
      return;
    }

    await rm(partialDirectory, { recursive: true, force: true });
    await mkdir(partialDirectory, { recursive: false, mode: 0o700 });

    const mongoArchive = path.join(partialDirectory, 'mongo.archive.gz');
    const filesDirectory = path.join(partialDirectory, 'files');
    const inventoryPath = path.join(
      partialDirectory,
      'files.inventory.jsonl',
    );
    await mkdir(filesDirectory, { mode: 0o700 });

    await withMongoConfig(mongoUri, async (configPath) => {
      runCommand('mongodump', [
        `--config=${configPath}`,
        `--archive=${mongoArchive}`,
        '--gzip',
        '--quiet',
      ]);
    });

    runCommand('aws', [
      '--endpoint-url',
      endpoint,
      's3',
      'sync',
      `s3://${bucket}`,
      filesDirectory,
      '--only-show-errors',
    ]);

    const inventory = await inventoryDirectory(filesDirectory);
    await writeInventory(inventoryPath, inventory);

    const mongoMetadata = await stat(mongoArchive);
    const totalBytes = inventory.reduce(
      (total, row) => total + row.byteSize,
      0,
    );
    const manifest = {
      formatVersion: RECOVERY_FORMAT_VERSION,
      backupSetId,
      createdAt: now.toISOString(),
      releaseSha,
      schemaVersion,
      sourceEnvironment,
      consistencyMode: 'application-quiesced',
      mongo: {
        archive: 'mongo.archive.gz',
        sha256: await sha256File(mongoArchive),
        byteSize: mongoMetadata.size,
      },
      files: {
        directory: 'files',
        inventory: 'files.inventory.jsonl',
        inventorySha256: await sha256File(inventoryPath),
        objectCount: inventory.length,
        totalBytes,
      },
      tooling: {
        node: process.version,
        mongodump: toolVersion('mongodump'),
        aws: toolVersion('aws'),
      },
    };

    await writeJsonAtomic(path.join(partialDirectory, 'manifest.json'), manifest);
    await verifyBackupSet(partialDirectory);
    await rename(partialDirectory, finalDirectory);

    console.log(
      JSON.stringify({
        event: 'recovery.backup.created',
        backupSetId,
        releaseSha,
        objectCount: inventory.length,
        totalBytes,
      }),
    );
  } finally {
    await releaseLock();
  }
}

void main().catch((error) => {
  console.error(
    JSON.stringify({
      event: 'recovery.backup.failed',
      errorType: error instanceof Error ? error.name : 'UnknownError',
    }),
  );
  process.exitCode = 1;
});
