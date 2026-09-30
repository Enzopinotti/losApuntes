import { readFile, rename, unlink, writeFile } from 'node:fs/promises';

const DEFAULT_HEALTH_PATH = '/tmp/losapuntes-files-worker-health.json';

export type FilesWorkerHealthStatus = 'ready' | 'not_ready';

export type FilesWorkerHealthSnapshot = {
  status: FilesWorkerHealthStatus;
  checkedAt: string;
  expiresAt: string;
};

export function filesWorkerHealthPath(): string {
  const configured = process.env.FILES_WORKER_HEALTH_PATH?.trim();
  if (!configured) return DEFAULT_HEALTH_PATH;
  if (!configured.startsWith('/') || configured.length > 240) {
    throw new Error('FILES_WORKER_HEALTH_PATH must be a bounded absolute path');
  }

  return configured;
}

export function filesWorkerHealthValidityMs(intervalMs: number): number {
  return Math.max(30_000, Math.min(intervalMs * 3, 30 * 60 * 1000));
}

export function isFilesWorkerHealthCurrent(
  value: unknown,
  nowMs = Date.now(),
): value is FilesWorkerHealthSnapshot {
  if (!value || typeof value !== 'object') return false;

  const candidate = value as Partial<FilesWorkerHealthSnapshot>;
  if (
    candidate.status !== 'ready' ||
    typeof candidate.checkedAt !== 'string' ||
    typeof candidate.expiresAt !== 'string'
  ) {
    return false;
  }

  const checkedAt = Date.parse(candidate.checkedAt);
  const expiresAt = Date.parse(candidate.expiresAt);

  return (
    Number.isFinite(checkedAt) &&
    Number.isFinite(expiresAt) &&
    checkedAt <= nowMs &&
    expiresAt > nowMs
  );
}

export async function writeFilesWorkerHealth(
  status: FilesWorkerHealthStatus,
  validForMs: number,
  now = new Date(),
): Promise<void> {
  const path = filesWorkerHealthPath();
  const temporaryPath = `${path}.tmp-${process.pid}`;
  const snapshot: FilesWorkerHealthSnapshot = {
    status,
    checkedAt: now.toISOString(),
    expiresAt: new Date(now.getTime() + validForMs).toISOString(),
  };

  await writeFile(temporaryPath, JSON.stringify(snapshot), {
    encoding: 'utf8',
    mode: 0o600,
  });
  await rename(temporaryPath, path);
}

export async function clearFilesWorkerHealth(): Promise<void> {
  await unlink(filesWorkerHealthPath()).catch((error: unknown) => {
    if (
      typeof error === 'object' &&
      error !== null &&
      'code' in error &&
      (error as { code?: unknown }).code === 'ENOENT'
    ) {
      return;
    }

    throw error;
  });
}

export async function readFilesWorkerHealth(): Promise<unknown> {
  const source = await readFile(filesWorkerHealthPath(), 'utf8');
  return JSON.parse(source) as unknown;
}
