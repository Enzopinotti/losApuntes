import assert from 'node:assert/strict';
import test from 'node:test';

import {
  composeEnvironmentFromEvidence,
  parseByteSize,
  validateProductionResilienceEvidence,
} from './resilience-lib.mjs';

const SHA = 'a'.repeat(40);
const PREVIOUS_SHA = 'b'.repeat(40);
const CURRENT_IMAGE = `sha256:${'c'.repeat(64)}`;
const ROLLBACK_IMAGE = `sha256:${'d'.repeat(64)}`;

function evidence() {
  return {
    version: 1,
    environment: 'production',
    releaseSha: SHA,
    measuredAt: '2026-10-01T22:00:00.000Z',
    hostCapacity: {
      cpuCores: 8,
      memoryBytes: 16 * 1024 ** 3,
      pids: 4096,
    },
    services: {
      api: {
        measurement: {
          windowSeconds: 1800,
          samples: 30,
          peakCpuCores: 1.1,
          peakMemoryBytes: 600 * 1024 ** 2,
          peakPids: 42,
          maxDrainSeconds: 7,
        },
        limits: {
          cpus: '2',
          memory: '1g',
          pids: 128,
          tmpfs: '64m',
          stopGracePeriodSeconds: 15,
        },
      },
      'files-worker': {
        measurement: {
          windowSeconds: 1800,
          samples: 30,
          peakCpuCores: 1.4,
          peakMemoryBytes: 700 * 1024 ** 2,
          peakPids: 36,
          maxDrainSeconds: 18,
        },
        limits: {
          cpus: '2.5',
          memory: '1536m',
          pids: 128,
          tmpfs: '128m',
          stopGracePeriodSeconds: 30,
        },
      },
    },
    logs: {
      api: {
        driver: 'local',
        observedPeakBytesPerHour: 4 * 1024 ** 2,
        diagnosticWindowHours: 6,
        maxSize: '10m',
        maxFiles: 3,
      },
      'files-worker': {
        driver: 'local',
        observedPeakBytesPerHour: 2 * 1024 ** 2,
        diagnosticWindowHours: 6,
        maxSize: '10m',
        maxFiles: 2,
      },
    },
    rollback: {
      runtimeCompatibility: 'n-1',
      currentReleaseSha: SHA,
      previousReleaseSha: PREVIOUS_SHA,
      currentImageDigest: CURRENT_IMAGE,
      rollbackImageDigest: ROLLBACK_IMAGE,
      dataRollbackMode: 'application-only',
      runbook: 'docs/operations/production-resilience.md',
    },
    releaseRetention: {
      maxRetainedImages: 4,
      globalPruneAllowed: false,
      protectedImageDigests: [CURRENT_IMAGE, ROLLBACK_IMAGE],
    },
  };
}

test('accepts measured budgets that fit inside the shared host', () => {
  const validated = validateProductionResilienceEvidence(evidence());
  assert.equal(validated.releaseSha, SHA);
  assert.equal(validated.services.api.limits.memoryBytes, 1024 ** 3);
});

test('renders only non-secret Compose resilience inputs', () => {
  assert.deepEqual(composeEnvironmentFromEvidence(evidence()), {
    API_CPU_LIMIT: '2',
    API_MEMORY_LIMIT: '1g',
    API_PIDS_LIMIT: '128',
    API_TMPFS_LIMIT: '64m',
    API_STOP_GRACE_PERIOD_SECONDS: '15',
    API_LOG_DRIVER: 'local',
    API_LOG_MAX_SIZE: '10m',
    API_LOG_MAX_FILES: '3',
    FILES_WORKER_CPU_LIMIT: '2.5',
    FILES_WORKER_MEMORY_LIMIT: '1536m',
    FILES_WORKER_PIDS_LIMIT: '128',
    FILES_WORKER_TMPFS_LIMIT: '128m',
    FILES_WORKER_STOP_GRACE_PERIOD_SECONDS: '30',
    FILES_WORKER_LOG_DRIVER: 'local',
    FILES_WORKER_LOG_MAX_SIZE: '10m',
    FILES_WORKER_LOG_MAX_FILES: '2',
  });
});

test('parses Docker byte-size values conservatively', () => {
  assert.equal(parseByteSize('64m'), 64 * 1024 ** 2);
  assert.equal(parseByteSize('1gb'), 1024 ** 3);
  assert.throws(() => parseByteSize('-1m'), /invalid byte-size/u);
});

test('rejects limits chosen below measured peaks', () => {
  const value = evidence();
  value.services.api.limits.memory = '512m';
  assert.throws(
    () => validateProductionResilienceEvidence(value),
    /below the measured memory peak/u,
  );
});

test('rejects a service budget that can consume the whole shared host', () => {
  const value = evidence();
  value.services.api.limits.cpus = '8';
  assert.throws(
    () => validateProductionResilienceEvidence(value),
    /leave CPU capacity/u,
  );
});

test('rejects aggregate service budgets that can overcommit the shared host', () => {
  const cpu = evidence();
  cpu.services.api.limits.cpus = '4';
  cpu.services['files-worker'].limits.cpus = '4';
  assert.throws(
    () => validateProductionResilienceEvidence(cpu),
    /aggregate service CPU limits must leave CPU capacity/u,
  );

  const memory = evidence();
  memory.services.api.limits.memory = '8g';
  memory.services['files-worker'].limits.memory = '8g';
  assert.throws(
    () => validateProductionResilienceEvidence(memory),
    /aggregate service memory limits must leave memory capacity/u,
  );

  const pids = evidence();
  pids.services.api.limits.pids = 2048;
  pids.services['files-worker'].limits.pids = 2048;
  assert.throws(
    () => validateProductionResilienceEvidence(pids),
    /aggregate service PID limits must leave PID capacity/u,
  );
});

test('rejects log rotation below the measured diagnostic window', () => {
  const value = evidence();
  value.logs.api.maxSize = '1m';
  value.logs.api.maxFiles = 2;
  assert.throws(
    () => validateProductionResilienceEvidence(value),
    /diagnostic window requirement/u,
  );
});

test('rejects grace below the measured drain time', () => {
  const value = evidence();
  value.services['files-worker'].limits.stopGracePeriodSeconds = 10;
  assert.throws(
    () => validateProductionResilienceEvidence(value),
    /below the measured drain time/u,
  );
});

test('forward-only releases require data recovery semantics', () => {
  const value = evidence();
  value.rollback.runtimeCompatibility = 'forward-only';
  assert.throws(
    () => validateProductionResilienceEvidence(value),
    /requires recovery-required/u,
  );
});

test('retention protects current and rollback image digests', () => {
  const value = evidence();
  value.releaseRetention.protectedImageDigests = [CURRENT_IMAGE];
  assert.throws(
    () => validateProductionResilienceEvidence(value),
    /protect current and rollback/u,
  );
});

test('retention bound must cover every protected image digest', () => {
  const value = evidence();
  value.releaseRetention.maxRetainedImages = 2;
  value.releaseRetention.protectedImageDigests.push(
    `sha256:${'e'.repeat(64)}`,
  );
  assert.throws(
    () => validateProductionResilienceEvidence(value),
    /must cover every protected image digest/u,
  );
});

test('global destructive prune is never accepted as retention policy', () => {
  const value = evidence();
  value.releaseRetention.globalPruneAllowed = true;
  assert.throws(
    () => validateProductionResilienceEvidence(value),
    /globalPruneAllowed must be false/u,
  );
});
