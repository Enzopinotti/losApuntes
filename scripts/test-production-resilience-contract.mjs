import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const [compose, docs, releaseEvidence] = await Promise.all([
  readFile(new URL('../compose.resilience.yml', import.meta.url), 'utf8'),
  readFile(
    new URL('../docs/operations/production-resilience.md', import.meta.url),
    'utf8',
  ),
  readFile(
    new URL('../docs/operations/release-evidence.md', import.meta.url),
    'utf8',
  ),
]);

for (const field of [
  'cpus:',
  'mem_limit:',
  'pids_limit:',
  'stop_grace_period:',
  'max-size:',
  'max-file:',
  '/tmp:size=',
]) {
  assert.equal(compose.includes(field), true, `missing Compose field ${field}`);
}

assert.doesNotMatch(compose, /docker\s+(?:system|image)\s+prune/iu);
assert.match(docs, /measured before limits/iu);
assert.match(docs, /application rollback/iu);
assert.match(docs, /data recovery/iu);
assert.match(docs, /global prune/iu);
assert.match(releaseEvidence, /Production resilience evidence file/iu);
assert.match(releaseEvidence, /Measured runtime budget reference/iu);
assert.match(releaseEvidence, /Log rotation evidence/iu);

console.log('PASS production resilience repository contract');
