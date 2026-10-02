import { readFile } from 'node:fs/promises';

import { composeEnvironmentFromEvidence } from './resilience-lib.mjs';

const evidencePath = process.env.PRODUCTION_RESILIENCE_EVIDENCE_FILE?.trim();
if (!evidencePath) {
  throw new Error('PRODUCTION_RESILIENCE_EVIDENCE_FILE is required');
}

const parsed = JSON.parse(await readFile(evidencePath, 'utf8'));
const environment = composeEnvironmentFromEvidence(parsed);

for (const [key, value] of Object.entries(environment)) {
  if (!/^[A-Z0-9_]+$/u.test(key) || /[\r\n]/u.test(value)) {
    throw new Error('invalid rendered Compose environment');
  }
  process.stdout.write(`${key}=${value}\n`);
}
