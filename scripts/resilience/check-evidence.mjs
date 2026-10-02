import { readFile } from 'node:fs/promises';

import {
  composeEnvironmentFromEvidence,
  validateProductionResilienceEvidence,
} from './resilience-lib.mjs';

const evidencePath = process.env.PRODUCTION_RESILIENCE_EVIDENCE_FILE?.trim();
if (!evidencePath) {
  throw new Error('PRODUCTION_RESILIENCE_EVIDENCE_FILE is required');
}

const parsed = JSON.parse(await readFile(evidencePath, 'utf8'));
const evidence = validateProductionResilienceEvidence(parsed);
const composeEnvironment = composeEnvironmentFromEvidence(parsed);

console.log(
  JSON.stringify({
    event: 'production.resilience.evidence',
    status: 'PASS',
    releaseSha: evidence.releaseSha,
    measuredAt: evidence.measuredAt,
    services: Object.keys(evidence.services),
    logDrivers: Object.fromEntries(
      Object.entries(evidence.logs).map(([name, value]) => [
        name,
        value.driver,
      ]),
    ),
    composeEnvironmentKeys: Object.keys(composeEnvironment).sort(),
  }),
);
