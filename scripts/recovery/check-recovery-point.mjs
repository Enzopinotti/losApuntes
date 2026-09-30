import {
  assertArtifactRootOutsideRepo,
  assertReleaseSha,
  existingDirectory,
  requireEnv,
  verifyBackupSet,
} from './recovery-lib.mjs';

function maximumAgeMs() {
  const raw = process.env.RECOVERY_MAX_AGE_HOURS?.trim() || '24';
  const hours = Number(raw);
  if (!Number.isFinite(hours) || hours <= 0 || hours > 720) {
    throw new Error('RECOVERY_MAX_AGE_HOURS must be > 0 and <= 720');
  }
  return hours * 60 * 60 * 1000;
}

async function main() {
  if (process.env.RECOVERY_FIRST_INSTALL_EMPTY?.trim().toLowerCase() === 'true') {
    if (
      process.env.RECOVERY_FIRST_INSTALL_ACK?.trim() !==
      'EMPTY_DATABASE_AND_EMPTY_FILES_CONFIRMED'
    ) {
      throw new Error(
        'empty first install requires RECOVERY_FIRST_INSTALL_ACK',
      );
    }

    console.log(
      JSON.stringify({
        event: 'recovery.point.gate',
        status: 'N/A',
        reason: 'empty-first-install',
      }),
    );
    return;
  }

  const expectedSourceSha = assertReleaseSha(
    requireEnv('RECOVERY_EXPECTED_SOURCE_SHA', 40),
    'RECOVERY_EXPECTED_SOURCE_SHA',
  );
  const setDirectory = assertArtifactRootOutsideRepo(
    await existingDirectory(requireEnv('RECOVERY_SET_DIR', 4096)),
  );
  const { manifest } = await verifyBackupSet(setDirectory);

  if (manifest.releaseSha !== expectedSourceSha) {
    throw new Error('recovery point does not belong to expected source release');
  }

  const ageMs = Date.now() - Date.parse(manifest.createdAt);
  if (ageMs < -5 * 60 * 1000) {
    throw new Error('recovery point timestamp is unexpectedly in the future');
  }
  if (ageMs > maximumAgeMs()) {
    throw new Error('recovery point is older than the accepted release window');
  }

  console.log(
    JSON.stringify({
      event: 'recovery.point.gate',
      status: 'PASS',
      backupSetId: manifest.backupSetId,
      sourceReleaseSha: manifest.releaseSha,
      schemaVersion: manifest.schemaVersion,
      ageMinutes: Math.max(0, Math.round(ageMs / 60_000)),
    }),
  );
}

void main().catch((error) => {
  console.error(
    JSON.stringify({
      event: 'recovery.point.gate',
      status: 'HOLD',
      errorType: error instanceof Error ? error.name : 'UnknownError',
    }),
  );
  process.exitCode = 2;
});
