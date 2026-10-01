const BYTE_UNITS = Object.freeze({
  b: 1,
  k: 1024,
  kb: 1024,
  m: 1024 ** 2,
  mb: 1024 ** 2,
  g: 1024 ** 3,
  gb: 1024 ** 3,
  t: 1024 ** 4,
  tb: 1024 ** 4,
});

function fail(message) {
  throw new Error(`production resilience evidence invalid: ${message}`);
}

function object(value, path) {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    fail(`${path} must be an object`);
  }
  return value;
}

function boundedText(value, path, maximum = 512) {
  if (
    typeof value !== 'string' ||
    value.trim().length === 0 ||
    value.length > maximum
  ) {
    fail(`${path} must be non-empty text <= ${maximum} characters`);
  }
  return value.trim();
}

function positiveNumber(value, path) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
    fail(`${path} must be a positive finite number`);
  }
  return value;
}

function positiveInteger(value, path) {
  if (!Number.isSafeInteger(value) || value <= 0) {
    fail(`${path} must be a positive safe integer`);
  }
  return value;
}

export function parseByteSize(value, path = 'byte size') {
  if (typeof value !== 'string') {
    fail(`${path} must be a Docker byte-size string`);
  }

  const match = value
    .trim()
    .toLowerCase()
    .match(/^(\d+(?:\.\d+)?)(b|k|kb|m|mb|g|gb|t|tb)?$/u);
  if (!match) fail(`${path} has invalid byte-size syntax`);

  const amount = Number(match[1]);
  const multiplier = BYTE_UNITS[match[2] ?? 'b'];
  const bytes = amount * multiplier;
  if (!Number.isSafeInteger(bytes) || bytes <= 0) {
    fail(`${path} must resolve to positive safe integer bytes`);
  }
  return bytes;
}

function exactSha(value, path) {
  if (typeof value !== 'string' || !/^[0-9a-f]{40}$/iu.test(value)) {
    fail(`${path} must be an exact 40-character Git SHA`);
  }
  return value.toLowerCase();
}

function imageDigest(value, path) {
  if (typeof value !== 'string' || !/^sha256:[0-9a-f]{64}$/iu.test(value)) {
    fail(`${path} must be an exact sha256 image digest`);
  }
  return value.toLowerCase();
}

function isoTimestamp(value, path) {
  if (
    typeof value !== 'string' ||
    !/^\d{4}-\d{2}-\d{2}T/u.test(value) ||
    !Number.isFinite(Date.parse(value))
  ) {
    fail(`${path} must be an ISO timestamp`);
  }
  return value;
}

function cpuLimit(value, path) {
  const parsed =
    typeof value === 'string' && value.trim() !== '' ? Number(value) : value;
  return positiveNumber(parsed, path);
}

function validateService(name, raw, host) {
  const service = object(raw, `services.${name}`);
  const measurement = object(
    service.measurement,
    `services.${name}.measurement`,
  );
  const limits = object(service.limits, `services.${name}.limits`);

  const measured = {
    windowSeconds: positiveInteger(
      measurement.windowSeconds,
      `services.${name}.measurement.windowSeconds`,
    ),
    samples: positiveInteger(
      measurement.samples,
      `services.${name}.measurement.samples`,
    ),
    peakCpuCores: positiveNumber(
      measurement.peakCpuCores,
      `services.${name}.measurement.peakCpuCores`,
    ),
    peakMemoryBytes: positiveInteger(
      measurement.peakMemoryBytes,
      `services.${name}.measurement.peakMemoryBytes`,
    ),
    peakPids: positiveInteger(
      measurement.peakPids,
      `services.${name}.measurement.peakPids`,
    ),
    maxDrainSeconds: positiveNumber(
      measurement.maxDrainSeconds,
      `services.${name}.measurement.maxDrainSeconds`,
    ),
  };

  const memory = boundedText(
    limits.memory,
    `services.${name}.limits.memory`,
    32,
  );
  const tmpfs = boundedText(
    limits.tmpfs,
    `services.${name}.limits.tmpfs`,
    32,
  );
  const selected = {
    cpus: cpuLimit(limits.cpus, `services.${name}.limits.cpus`),
    memory,
    memoryBytes: parseByteSize(
      memory,
      `services.${name}.limits.memory`,
    ),
    pids: positiveInteger(
      limits.pids,
      `services.${name}.limits.pids`,
    ),
    tmpfs,
    tmpfsBytes: parseByteSize(
      tmpfs,
      `services.${name}.limits.tmpfs`,
    ),
    stopGracePeriodSeconds: positiveNumber(
      limits.stopGracePeriodSeconds,
      `services.${name}.limits.stopGracePeriodSeconds`,
    ),
  };

  if (selected.cpus < measured.peakCpuCores) {
    fail(`services.${name}.limits.cpus is below the measured CPU peak`);
  }
  if (selected.memoryBytes < measured.peakMemoryBytes) {
    fail(`services.${name}.limits.memory is below the measured memory peak`);
  }
  if (selected.pids < measured.peakPids) {
    fail(`services.${name}.limits.pids is below the measured PID peak`);
  }
  if (selected.stopGracePeriodSeconds < measured.maxDrainSeconds) {
    fail(
      `services.${name}.limits.stopGracePeriodSeconds is below the measured drain time`,
    );
  }
  if (selected.tmpfsBytes >= selected.memoryBytes) {
    fail(`services.${name}.limits.tmpfs must be smaller than memory limit`);
  }
  if (selected.cpus >= host.cpuCores) {
    fail(`services.${name}.limits.cpus must leave CPU capacity for the shared host`);
  }
  if (selected.memoryBytes >= host.memoryBytes) {
    fail(`services.${name}.limits.memory must leave memory capacity for the shared host`);
  }
  if (selected.pids >= host.pids) {
    fail(`services.${name}.limits.pids must leave PID capacity for the shared host`);
  }

  return {
    measurement: measured,
    limits: { ...selected, cpus: String(selected.cpus) },
  };
}

function validateLogBudget(name, raw) {
  const log = object(raw, `logs.${name}`);
  const driver = boundedText(log.driver, `logs.${name}.driver`, 32);
  if (!['local', 'json-file'].includes(driver)) {
    fail(`logs.${name}.driver must be local or json-file`);
  }

  const observedPeakBytesPerHour = positiveInteger(
    log.observedPeakBytesPerHour,
    `logs.${name}.observedPeakBytesPerHour`,
  );
  const diagnosticWindowHours = positiveNumber(
    log.diagnosticWindowHours,
    `logs.${name}.diagnosticWindowHours`,
  );
  const maxSize = boundedText(log.maxSize, `logs.${name}.maxSize`, 32);
  const maxSizeBytes = parseByteSize(maxSize, `logs.${name}.maxSize`);
  const maxFiles = positiveInteger(log.maxFiles, `logs.${name}.maxFiles`);
  const capacityBytes = maxSizeBytes * maxFiles;
  const requiredBytes = observedPeakBytesPerHour * diagnosticWindowHours;

  if (!Number.isSafeInteger(capacityBytes)) {
    fail(`logs.${name} configured capacity exceeds safe integer range`);
  }
  if (capacityBytes < requiredBytes) {
    fail(
      `logs.${name} rotation capacity is below the measured diagnostic window requirement`,
    );
  }

  return {
    driver,
    observedPeakBytesPerHour,
    diagnosticWindowHours,
    maxSize,
    maxSizeBytes,
    maxFiles,
    capacityBytes,
  };
}

export function validateProductionResilienceEvidence(raw) {
  const root = object(raw, 'evidence');
  if (root.version !== 1) fail('version must be 1');

  const environment = boundedText(root.environment, 'environment', 64);
  if (environment.toLowerCase() !== 'production') {
    fail('environment must be production');
  }

  const releaseSha = exactSha(root.releaseSha, 'releaseSha');
  const measuredAt = isoTimestamp(root.measuredAt, 'measuredAt');
  const hostRaw = object(root.hostCapacity, 'hostCapacity');
  const hostCapacity = {
    cpuCores: positiveNumber(hostRaw.cpuCores, 'hostCapacity.cpuCores'),
    memoryBytes: positiveInteger(
      hostRaw.memoryBytes,
      'hostCapacity.memoryBytes',
    ),
    pids: positiveInteger(hostRaw.pids, 'hostCapacity.pids'),
  };

  const servicesRaw = object(root.services, 'services');
  const services = {
    api: validateService('api', servicesRaw.api, hostCapacity),
    'files-worker': validateService(
      'files-worker',
      servicesRaw['files-worker'],
      hostCapacity,
    ),
  };

  const logsRaw = object(root.logs, 'logs');
  const logs = {
    api: validateLogBudget('api', logsRaw.api),
    'files-worker': validateLogBudget(
      'files-worker',
      logsRaw['files-worker'],
    ),
  };

  const rollbackRaw = object(root.rollback, 'rollback');
  const runtimeCompatibility = boundedText(
    rollbackRaw.runtimeCompatibility,
    'rollback.runtimeCompatibility',
    32,
  );
  if (!['n-1', 'forward-only'].includes(runtimeCompatibility)) {
    fail('rollback.runtimeCompatibility must be n-1 or forward-only');
  }

  const rollback = {
    runtimeCompatibility,
    currentReleaseSha: exactSha(
      rollbackRaw.currentReleaseSha,
      'rollback.currentReleaseSha',
    ),
    previousReleaseSha: exactSha(
      rollbackRaw.previousReleaseSha,
      'rollback.previousReleaseSha',
    ),
    currentImageDigest: imageDigest(
      rollbackRaw.currentImageDigest,
      'rollback.currentImageDigest',
    ),
    rollbackImageDigest: imageDigest(
      rollbackRaw.rollbackImageDigest,
      'rollback.rollbackImageDigest',
    ),
    dataRollbackMode: boundedText(
      rollbackRaw.dataRollbackMode,
      'rollback.dataRollbackMode',
      32,
    ),
    runbook: boundedText(rollbackRaw.runbook, 'rollback.runbook', 256),
  };

  if (rollback.currentReleaseSha !== releaseSha) {
    fail('rollback.currentReleaseSha must match releaseSha');
  }
  if (rollback.previousReleaseSha === releaseSha) {
    fail('rollback.previousReleaseSha must differ from releaseSha');
  }
  if (
    !['application-only', 'recovery-required'].includes(
      rollback.dataRollbackMode,
    )
  ) {
    fail(
      'rollback.dataRollbackMode must be application-only or recovery-required',
    );
  }
  if (
    rollback.runtimeCompatibility === 'forward-only' &&
    rollback.dataRollbackMode !== 'recovery-required'
  ) {
    fail(
      'forward-only runtime compatibility requires recovery-required data rollback mode',
    );
  }

  const retentionRaw = object(root.releaseRetention, 'releaseRetention');
  const maxRetainedImages = positiveInteger(
    retentionRaw.maxRetainedImages,
    'releaseRetention.maxRetainedImages',
  );
  if (maxRetainedImages < 2) {
    fail('releaseRetention.maxRetainedImages must preserve current + rollback images');
  }
  if (retentionRaw.globalPruneAllowed !== false) {
    fail('releaseRetention.globalPruneAllowed must be false');
  }
  if (!Array.isArray(retentionRaw.protectedImageDigests)) {
    fail('releaseRetention.protectedImageDigests must be an array');
  }
  const protectedImageDigests = retentionRaw.protectedImageDigests.map(
    (value, index) =>
      imageDigest(value, `releaseRetention.protectedImageDigests[${index}]`),
  );
  for (const required of [
    rollback.currentImageDigest,
    rollback.rollbackImageDigest,
  ]) {
    if (!protectedImageDigests.includes(required)) {
      fail('releaseRetention must protect current and rollback image digests');
    }
  }

  return {
    version: 1,
    environment: 'production',
    releaseSha,
    measuredAt,
    hostCapacity,
    services,
    logs,
    rollback,
    releaseRetention: {
      maxRetainedImages,
      globalPruneAllowed: false,
      protectedImageDigests: [...new Set(protectedImageDigests)],
    },
  };
}

export function composeEnvironmentFromEvidence(raw) {
  const value = validateProductionResilienceEvidence(raw);
  return {
    API_CPU_LIMIT: value.services.api.limits.cpus,
    API_MEMORY_LIMIT: value.services.api.limits.memory,
    API_PIDS_LIMIT: String(value.services.api.limits.pids),
    API_TMPFS_LIMIT: value.services.api.limits.tmpfs,
    API_STOP_GRACE_PERIOD_SECONDS: String(
      value.services.api.limits.stopGracePeriodSeconds,
    ),
    API_LOG_DRIVER: value.logs.api.driver,
    API_LOG_MAX_SIZE: value.logs.api.maxSize,
    API_LOG_MAX_FILES: String(value.logs.api.maxFiles),
    FILES_WORKER_CPU_LIMIT: value.services['files-worker'].limits.cpus,
    FILES_WORKER_MEMORY_LIMIT: value.services['files-worker'].limits.memory,
    FILES_WORKER_PIDS_LIMIT: String(value.services['files-worker'].limits.pids),
    FILES_WORKER_TMPFS_LIMIT: value.services['files-worker'].limits.tmpfs,
    FILES_WORKER_STOP_GRACE_PERIOD_SECONDS: String(
      value.services['files-worker'].limits.stopGracePeriodSeconds,
    ),
    FILES_WORKER_LOG_DRIVER: value.logs['files-worker'].driver,
    FILES_WORKER_LOG_MAX_SIZE: value.logs['files-worker'].maxSize,
    FILES_WORKER_LOG_MAX_FILES: String(value.logs['files-worker'].maxFiles),
  };
}
