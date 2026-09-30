import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  realpath,
  rename,
  rm,
  stat,
  writeFile,
} from 'node:fs/promises';
import { createReadStream } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const RECOVERY_FORMAT_VERSION = 1;
export const REPO_ROOT = fileURLToPath(new URL('../../', import.meta.url));

export function requireEnv(name, maximumLength = 4096) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required`);
  if (value.length > maximumLength) {
    throw new Error(`${name} exceeds its maximum accepted length`);
  }
  return value;
}

export function optionalEnv(name, maximumLength = 4096) {
  const value = process.env[name]?.trim();
  if (!value) return undefined;
  if (value.length > maximumLength) {
    throw new Error(`${name} exceeds its maximum accepted length`);
  }
  return value;
}

export function assertReleaseSha(value, name = 'RELEASE_SHA') {
  if (!/^[0-9a-f]{40}$/iu.test(value)) {
    throw new Error(`${name} must be an exact 40-character Git SHA`);
  }
  return value.toLowerCase();
}

export function assertBackupSetId(value) {
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,95}$/u.test(value)) {
    throw new Error(
      'backup set id must be 1-96 safe filename characters',
    );
  }
  return value;
}

export function assertSchemaVersion(value) {
  if (!/^[A-Za-z0-9][A-Za-z0-9._:-]{0,95}$/u.test(value)) {
    throw new Error('schema version must be a bounded opaque identifier');
  }
  return value;
}

export function assertEnvironmentLabel(value, name) {
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/u.test(value)) {
    throw new Error(`${name} must be a bounded environment label`);
  }
  return value;
}

export function assertNonProductionTarget(value) {
  const normalized = value.trim().toLowerCase();
  const forbidden = new Set([
    'prod',
    'production',
    'prd',
    'live',
    'public',
    'public-prod',
  ]);
  if (forbidden.has(normalized) || normalized.includes('production')) {
    throw new Error('restore target must not be production');
  }
  return assertEnvironmentLabel(value, 'RESTORE_TARGET_ENV');
}

export function assertRootEndpoint(value, name) {
  let url;
  try {
    url = new URL(value);
  } catch {
    throw new Error(`${name} must be an absolute HTTP(S) root origin`);
  }

  if (
    !['http:', 'https:'].includes(url.protocol) ||
    url.username ||
    url.password ||
    (url.pathname !== '/' && url.pathname !== '') ||
    url.search ||
    url.hash
  ) {
    throw new Error(`${name} must be an absolute HTTP(S) root origin`);
  }

  return url.origin;
}

export function assertBucketName(value, name) {
  if (
    value.length < 3 ||
    value.length > 255 ||
    !/^[A-Za-z0-9][A-Za-z0-9._-]*[A-Za-z0-9]$/u.test(value)
  ) {
    throw new Error(`${name} is not a valid bounded bucket identifier`);
  }
  return value;
}

export function pathIsInside(parent, candidate) {
  const relative = path.relative(path.resolve(parent), path.resolve(candidate));
  return (
    relative === '' ||
    (!relative.startsWith(`..${path.sep}`) &&
      relative !== '..' &&
      !path.isAbsolute(relative))
  );
}

export function assertArtifactRootOutsideRepo(value, repoRoot = REPO_ROOT) {
  if (!path.isAbsolute(value)) {
    throw new Error('artifact root must be an absolute path');
  }

  const resolved = path.resolve(value);
  if (resolved === path.parse(resolved).root) {
    throw new Error('artifact root must not be a filesystem root');
  }
  if (pathIsInside(repoRoot, resolved)) {
    throw new Error('backup/recovery artifacts must live outside the repository');
  }
  return resolved;
}

export async function sha256File(filename) {
  const digest = createHash('sha256');
  await new Promise((resolve, reject) => {
    const stream = createReadStream(filename);
    stream.on('data', (chunk) => digest.update(chunk));
    stream.on('error', reject);
    stream.on('end', resolve);
  });
  return digest.digest('hex');
}

async function walkFiles(root, directory, output) {
  const entries = await readdir(directory, { withFileTypes: true });
  entries.sort((left, right) => left.name.localeCompare(right.name));

  for (const entry of entries) {
    const absolute = path.join(directory, entry.name);
    const relative = path.relative(root, absolute).split(path.sep).join('/');

    if (entry.isSymbolicLink()) {
      throw new Error('backup inventory must not contain symbolic links');
    }
    if (entry.isDirectory()) {
      await walkFiles(root, absolute, output);
      continue;
    }
    if (!entry.isFile()) {
      throw new Error('backup inventory contains an unsupported filesystem entry');
    }

    const metadata = await stat(absolute);
    output.push({
      key: relative,
      byteSize: metadata.size,
      sha256: await sha256File(absolute),
    });
  }
}

export async function inventoryDirectory(root) {
  const rows = [];
  await walkFiles(root, root, rows);
  return rows;
}

export async function writeJsonAtomic(filename, value) {
  const temporary = `${filename}.tmp-${process.pid}`;
  await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, {
    encoding: 'utf8',
    mode: 0o600,
  });
  await rename(temporary, filename);
}

export async function writeInventory(filename, rows) {
  const body = rows.map((row) => JSON.stringify(row)).join('\n');
  await writeFile(filename, body ? `${body}\n` : '', {
    encoding: 'utf8',
    mode: 0o600,
  });
}

export async function readJson(filename) {
  return JSON.parse(await readFile(filename, 'utf8'));
}

export function runCommand(command, args, options = {}) {
  const result = spawnSync(command, args, {
    encoding: 'utf8',
    env: options.env ?? process.env,
    cwd: options.cwd,
    maxBuffer: 4 * 1024 * 1024,
  });

  if (result.error) {
    throw new Error(`${command} could not be executed`);
  }
  if (result.status !== 0) {
    throw new Error(`${command} failed with exit code ${result.status ?? 'unknown'}`);
  }

  return (result.stdout ?? '').trim();
}

export function toolVersion(command) {
  try {
    return runCommand(command, ['--version'])
      .split(/\r?\n/u)
      .find(Boolean)
      ?.slice(0, 180) ?? 'unknown';
  } catch {
    return 'unavailable';
  }
}

export async function withMongoConfig(uri, callback) {
  const directory = await mkdtemp(path.join(tmpdir(), 'losapuntes-mongo-'));
  const configPath = path.join(directory, 'mongo-tools.yml');

  try {
    await writeFile(configPath, `uri: ${JSON.stringify(uri)}\n`, {
      encoding: 'utf8',
      mode: 0o600,
    });
    return await callback(configPath);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

export async function acquireDirectoryLock(lockPath) {
  await mkdir(path.dirname(lockPath), { recursive: true, mode: 0o700 });
  try {
    await mkdir(lockPath, { mode: 0o700 });
  } catch {
    throw new Error('another recovery operation already holds this lock');
  }

  return async () => {
    await rm(lockPath, { recursive: true, force: true });
  };
}

export function generatedBackupSetId(now, releaseSha) {
  return `${now
    .toISOString()
    .replace(/[-:]/gu, '')
    .replace(/\.\d{3}Z$/u, 'Z')}-${releaseSha.slice(0, 12)}`;
}

export function validateManifestShape(value) {
  if (!value || typeof value !== 'object') {
    throw new Error('backup manifest must be a JSON object');
  }

  const manifest = value;
  if (manifest.formatVersion !== RECOVERY_FORMAT_VERSION) {
    throw new Error('unsupported backup manifest format');
  }
  assertBackupSetId(manifest.backupSetId);
  assertReleaseSha(manifest.releaseSha, 'manifest releaseSha');
  assertSchemaVersion(manifest.schemaVersion);
  assertEnvironmentLabel(manifest.sourceEnvironment, 'sourceEnvironment');

  if (manifest.consistencyMode !== 'application-quiesced') {
    throw new Error('backup set is not marked application-quiesced');
  }
  if (!Number.isFinite(Date.parse(manifest.createdAt))) {
    throw new Error('backup manifest has an invalid createdAt');
  }
  if (
    !manifest.mongo ||
    manifest.mongo.archive !== 'mongo.archive.gz' ||
    !/^[0-9a-f]{64}$/u.test(manifest.mongo.sha256) ||
    !Number.isSafeInteger(manifest.mongo.byteSize) ||
    manifest.mongo.byteSize < 0
  ) {
    throw new Error('backup manifest has invalid Mongo metadata');
  }
  if (
    !manifest.files ||
    manifest.files.directory !== 'files' ||
    manifest.files.inventory !== 'files.inventory.jsonl' ||
    !/^[0-9a-f]{64}$/u.test(manifest.files.inventorySha256) ||
    !Number.isSafeInteger(manifest.files.objectCount) ||
    manifest.files.objectCount < 0 ||
    !Number.isSafeInteger(manifest.files.totalBytes) ||
    manifest.files.totalBytes < 0
  ) {
    throw new Error('backup manifest has invalid Files metadata');
  }

  return manifest;
}

export async function readInventory(filename) {
  const source = await readFile(filename, 'utf8');
  const lines = source.split(/\r?\n/u).filter(Boolean);
  const rows = lines.map((line) => JSON.parse(line));

  for (const row of rows) {
    if (
      !row ||
      typeof row.key !== 'string' ||
      row.key.length < 1 ||
      row.key.startsWith('/') ||
      row.key.includes('..') ||
      !Number.isSafeInteger(row.byteSize) ||
      row.byteSize < 0 ||
      !/^[0-9a-f]{64}$/u.test(row.sha256)
    ) {
      throw new Error('Files inventory contains an invalid row');
    }
  }

  return rows;
}

export async function verifyBackupSet(setDirectory) {
  const manifestPath = path.join(setDirectory, 'manifest.json');
  const manifest = validateManifestShape(await readJson(manifestPath));
  const mongoPath = path.join(setDirectory, manifest.mongo.archive);
  const filesPath = path.join(setDirectory, manifest.files.directory);
  const inventoryPath = path.join(setDirectory, manifest.files.inventory);

  const mongoMetadata = await stat(mongoPath);
  if (
    mongoMetadata.size !== manifest.mongo.byteSize ||
    (await sha256File(mongoPath)) !== manifest.mongo.sha256
  ) {
    throw new Error('Mongo backup archive checksum/size mismatch');
  }

  if ((await sha256File(inventoryPath)) !== manifest.files.inventorySha256) {
    throw new Error('Files inventory checksum mismatch');
  }

  const expected = await readInventory(inventoryPath);
  const actual = await inventoryDirectory(filesPath);
  if (actual.length !== expected.length) {
    throw new Error('Files backup object count does not match inventory');
  }

  let totalBytes = 0;
  for (let index = 0; index < expected.length; index += 1) {
    const left = expected[index];
    const right = actual[index];
    if (
      left.key !== right.key ||
      left.byteSize !== right.byteSize ||
      left.sha256 !== right.sha256
    ) {
      throw new Error('Files backup content does not match inventory');
    }
    totalBytes += right.byteSize;
  }

  if (
    expected.length !== manifest.files.objectCount ||
    totalBytes !== manifest.files.totalBytes
  ) {
    throw new Error('Files backup manifest counters do not match inventory');
  }

  return {
    manifest,
    manifestPath,
    mongoPath,
    filesPath,
    inventoryPath,
    inventory: expected,
  };
}

export async function existingDirectory(value) {
  const resolved = path.resolve(value);
  const metadata = await stat(resolved);
  if (!metadata.isDirectory()) throw new Error('expected an existing directory');
  return realpath(resolved);
}
