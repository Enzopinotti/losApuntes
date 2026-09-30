import assert from 'node:assert/strict';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  assertNonProductionTarget,
  assertReleaseSha,
  generatedBackupSetId,
  inventoryDirectory,
  pathIsInside,
  sha256File,
  validateManifestShape,
} from './recovery-lib.mjs';

test('release and environment guards fail closed', () => {
  assert.equal(
    assertReleaseSha('a'.repeat(40)),
    'a'.repeat(40),
  );
  assert.throws(() => assertReleaseSha('abc'), /exact 40-character/u);
  assert.throws(() => assertNonProductionTarget('production'), /must not/u);
  assert.throws(() => assertNonProductionTarget('public-production'), /must not/u);
  assert.equal(assertNonProductionTarget('restore-drill'), 'restore-drill');
});

test('path containment cannot confuse siblings with descendants', () => {
  assert.equal(pathIsInside('/srv/losApuntes', '/srv/losApuntes/backups'), true);
  assert.equal(pathIsInside('/srv/losApuntes', '/srv/losApuntes-backups'), false);
});

test('backup ids are deterministic from timestamp and release', () => {
  assert.equal(
    generatedBackupSetId(
      new Date('2026-09-30T01:02:03.456Z'),
      '0123456789abcdef0123456789abcdef01234567',
    ),
    '20260930T010203Z-0123456789ab',
  );
});

test('inventory is stable, sorted and content-addressed', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'losapuntes-recovery-test-'));
  try {
    await mkdir(path.join(root, 'b'));
    await writeFile(path.join(root, 'b', '2.txt'), 'two');
    await writeFile(path.join(root, '1.txt'), 'one');

    const rows = await inventoryDirectory(root);
    assert.deepEqual(
      rows.map((row) => row.key),
      ['1.txt', 'b/2.txt'],
    );
    assert.equal(rows[0].sha256, await sha256File(path.join(root, '1.txt')));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('manifest requires an application-quiesced coherent set', () => {
  const base = {
    formatVersion: 1,
    backupSetId: 'set-1',
    createdAt: '2026-09-30T00:00:00.000Z',
    releaseSha: 'a'.repeat(40),
    schemaVersion: 'mongo-v1',
    sourceEnvironment: 'production',
    consistencyMode: 'application-quiesced',
    mongo: {
      archive: 'mongo.archive.gz',
      sha256: 'b'.repeat(64),
      byteSize: 10,
    },
    files: {
      directory: 'files',
      inventory: 'files.inventory.jsonl',
      inventorySha256: 'c'.repeat(64),
      objectCount: 1,
      totalBytes: 10,
    },
  };

  assert.equal(validateManifestShape(base).backupSetId, 'set-1');
  assert.throws(
    () => validateManifestShape({ ...base, consistencyMode: 'best-effort' }),
    /not marked application-quiesced/u,
  );
});
