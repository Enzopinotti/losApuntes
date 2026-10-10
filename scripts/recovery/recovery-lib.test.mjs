import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import {
  mkdtemp,
  mkdir,
  readFile,
  rename,
  rm,
  symlink,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  assertArtifactRootOutsideRepo,
  assertNonProductionTarget,
  assertReleaseSha,
  generatedBackupSetId,
  inventoryDirectory,
  pathIsInside,
  sha256File,
  validateManifestShape,
  verifyBackupSet,
  writeInventory,
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

test('destructive restore rejects production labels with suffixes and aliases', () => {
  const forbidden = [
    'prod',
    'production',
    'prod-eu',
    'prd-2',
    'live-1',
    'public-west',
    'restore-prod',
    'restore-live1',
    'qa-Prod',
    'staging.production',
    'PreProduction',
    'restore-prodclone',
    'LIVE',
  ];

  for (const label of forbidden) {
    assert.throws(
      () => assertNonProductionTarget(label),
      /restore target must not be production/u,
      label,
    );
  }
});

test('destructive restore requires an explicit nonproduction designation', () => {
  for (const label of ['beta', 'campus', 'unknown', 'qa2', 'preprod']) {
    assert.throws(
      () => assertNonProductionTarget(label),
      /explicit non-production label/u,
      label,
    );
  }

  for (const label of [
    'restore-drill',
    'dev',
    'development-east',
    'test_1',
    'qa-west',
    'staging',
    'sandbox-1',
    'local.test',
    'preview_2',
  ]) {
    assert.equal(assertNonProductionTarget(label), label);
  }
});

test('path containment cannot confuse siblings with descendants', () => {
  assert.equal(pathIsInside('/srv/losApuntes', '/srv/losApuntes/backups'), true);
  assert.equal(pathIsInside('/srv/losApuntes', '/srv/losApuntes-backups'), false);
});

test('artifact root checks physical ancestors before creating directories', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'losapuntes-recovery-roots-'));
  const repoRoot = path.join(root, 'repo');
  const externalRoot = path.join(root, 'external');

  try {
    await mkdir(repoRoot);
    await mkdir(externalRoot);
    await mkdir(path.join(repoRoot, 'existing'));

    const aliasToRepo = path.join(externalRoot, 'repo-alias');
    await symlink(repoRoot, aliasToRepo, 'dir');

    for (const unsafe of [
      path.join(repoRoot, 'backup'),
      aliasToRepo,
      path.join(aliasToRepo, 'existing'),
      path.join(aliasToRepo, 'new', 'nested'),
    ]) {
      assert.throws(
        () => assertArtifactRootOutsideRepo(unsafe, repoRoot),
        /outside the repository/u,
        unsafe,
      );
    }

    // Root validation happens before mkdir; no directory should be created
    // through the alias on a rejected path.
    assert.equal(existsSync(path.join(repoRoot, 'new')), false);

    const legitimate = path.join(externalRoot, 'new', 'nested');
    assert.equal(
      assertArtifactRootOutsideRepo(legitimate, repoRoot),
      legitimate,
    );
    assert.equal(
      assertArtifactRootOutsideRepo(path.join(root, 'repo-sibling'), repoRoot),
      path.join(root, 'repo-sibling'),
    );

    const aliasToOutside = path.join(externalRoot, 'safe-alias');
    await mkdir(path.join(externalRoot, 'safe'));
    await symlink(path.join(externalRoot, 'safe'), aliasToOutside, 'dir');
    assert.equal(
      assertArtifactRootOutsideRepo(
        path.join(aliasToOutside, 'backup'),
        repoRoot,
      ),
      path.join(externalRoot, 'safe', 'backup'),
    );

    const aliasToFilesystemRoot = path.join(externalRoot, 'fs-root');
    await symlink(path.parse(root).root, aliasToFilesystemRoot, 'dir');
    assert.throws(
      () => assertArtifactRootOutsideRepo(aliasToFilesystemRoot, repoRoot),
      /filesystem root/u,
    );

    const dangling = path.join(externalRoot, 'dangling');
    await symlink(path.join(root, 'missing-destination'), dangling, 'dir');
    assert.throws(
      () => assertArtifactRootOutsideRepo(path.join(dangling, 'new'), repoRoot),
      /unresolved symbolic links/u,
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
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


test('backup verifier rejects symlinked entrypoints despite matching checksums', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'losapuntes-recovery-links-'));
  const setDirectory = path.join(root, 'backup-set');
  const filesDirectory = path.join(setDirectory, 'files');
  const externalDirectory = path.join(root, 'external');

  try {
    await mkdir(filesDirectory, { recursive: true });
    await mkdir(externalDirectory);
    await writeFile(path.join(filesDirectory, 'note.txt'), 'trusted file');
    const mongoPath = path.join(setDirectory, 'mongo.archive.gz');
    await writeFile(mongoPath, 'mongo archive fixture');

    const inventory = await inventoryDirectory(filesDirectory);
    const inventoryPath = path.join(setDirectory, 'files.inventory.jsonl');
    await writeInventory(inventoryPath, inventory);

    const manifest = {
      formatVersion: 1,
      backupSetId: 'fixture-set',
      createdAt: '2026-10-10T00:00:00.000Z',
      releaseSha: 'a'.repeat(40),
      schemaVersion: 'mongo-v1',
      sourceEnvironment: 'production',
      consistencyMode: 'application-quiesced',
      mongo: {
        archive: 'mongo.archive.gz',
        sha256: await sha256File(mongoPath),
        byteSize: (await readFile(mongoPath)).byteLength,
      },
      files: {
        directory: 'files',
        inventory: 'files.inventory.jsonl',
        inventorySha256: await sha256File(inventoryPath),
        objectCount: inventory.length,
        totalBytes: inventory.reduce((sum, row) => sum + row.byteSize, 0),
      },
    };
    const manifestPath = path.join(setDirectory, 'manifest.json');
    await writeFile(manifestPath, JSON.stringify(manifest));

    assert.equal((await verifyBackupSet(setDirectory)).inventory.length, 1);

    // Each external target has the same bytes as the original entrypoint.
    // The verifier must reject the link itself, not just checksum mismatches.
    for (const entry of [
      'manifest.json',
      'mongo.archive.gz',
      'files.inventory.jsonl',
      'files',
    ]) {
      const original = path.join(setDirectory, entry);
      const preserved = path.join(setDirectory, `${entry}.original`);
      const outside = path.join(externalDirectory, entry);
      const directory = entry === 'files';

      if (directory) {
        await mkdir(outside);
        await writeFile(path.join(outside, 'note.txt'), 'trusted file');
      } else {
        await writeFile(outside, await readFile(original));
      }

      await rename(original, preserved);
      try {
        await symlink(outside, original, directory ? 'dir' : 'file');
        await assert.rejects(
          () => verifyBackupSet(setDirectory),
          /backup (manifest must be a regular file|set entrypoints must be regular files\/directories)/u,
          entry,
        );
      } finally {
        await rm(original, { force: true });
        await rename(preserved, original);
      }
    }

    assert.equal((await verifyBackupSet(setDirectory)).inventory.length, 1);
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
