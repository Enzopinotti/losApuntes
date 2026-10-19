import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = path => readFileSync(new URL('../' + path, import.meta.url), 'utf8');
const helper = read('scripts/testing/b89-local-mongo-uri.mjs');
const runner = read('scripts/run-account-export-b86-local-acceptance.mjs');
const vectors = read('scripts/test-account-export-b89-local-mongo-uri.test.mjs');
const mongoSpec = read('apps/api/src/study-progress/mongo/study-progress.mongo-int.spec.ts');
const pkg = JSON.parse(read('package.json'));
const ops = read('docs/operations/account-export-artifacts.md');
const config = read('apps/api/src/config/runtime-environment.ts');

let passed = 0;
function check(name, fn) {
  fn();
  passed += 1;
  console.log('PASS ' + name);
}

check('B89 URI must be mongodb with explicit, uncredentialed loopback host', () => {
  assert.match(helper, /parsed\.protocol !== 'mongodb:'/u);
  assert.match(helper, /'127\.0\.0\.1', 'localhost', '::1'/u);
  assert.match(helper, /parsed\.username \|\| parsed\.password/u);
  assert.match(helper, /parsed\.port/u);
  assert.match(helper, /port < 1 \|\| port > 65535/u);
});
check('B89 refuses a selected database and arbitrary connection options', () => {
  assert.match(helper, /parsed\.pathname !== '\/'/u);
  assert.match(helper, /entries\.length !== 1/u);
  assert.match(helper, /entries\[0\]\[0\] !== 'replicaSet'/u);
});
check('B89 requires DNS resolution for each permitted hostname', () => {
  assert.match(helper, /node:dns\/promises/u);
  assert.match(helper, /lookupHost\(hostname, \{ all: true, verbatim: true \}\)/u);
  assert.match(helper, /addresses\.length === 0/u);
});
check('B89 every address must be a real IPv4/IPv6 loopback', () => {
  assert.match(helper, /entry\.family !== isIP\(entry\.address\)/u);
  assert.match(helper, /entry\.address\.split\('\.'\)\[0\] === '127'/u);
  assert.match(helper, /entry\.address === '::1'/u);
});
check('B89 pins checked numeric endpoint and prevents replica discovery redirects', () => {
  assert.match(helper, /parsed\.hostname = preferred\.family === 6/u);
  assert.match(helper, /parsed\.searchParams\.set\('directConnection', 'true'\)/u);
  assert.match(runner, /STUDY_PROGRESS_TEST_MONGO_URI: safeUri/u);
});
check('B89 rejects invalid destination BEFORE spawning Jest', () => {
  const validation = runner.indexOf('await validateB89LocalMongoUri(uri)');
  const spawn = runner.indexOf("spawnSync('pnpm', args");
  assert.ok(validation >= 0 && spawn > validation);
  assert.match(runner, /B89 rejected Mongo URI/u);
  assert.match(runner, /process\.exit\(2\)/u);
});
check('B89 preserves project release and exact B86 Jest selection', () => {
  assert.match(runner, /STUDY_PROGRESS_ENABLED === 'true'/u);
  assert.match(runner, /process\.versions\.node/u);
  assert.match(runner, /--testNamePattern', B94_MONGO_TEST_PATTERN/u);
  assert.match(runner, /--passWithNoTests=false/u);
});
check('B89 leaves original database-level guards and random isolated db intact', () => {
  assert.match(mongoSpec, /const database = 'losapuntes_b61_' \+ randomUUID\(\)/u);
  assert.match(mongoSpec, /connection\.dropDatabase\(\)/u);
  assert.match(mongoSpec, /hello\.isWritablePrimary !== true/u);
});
check('B89 executable vectors cover DNS rebinding, foreign destinations and URI injection', () => {
  assert.match(vectors, /B89 pins localhost to a validated numeric destination/u);
  assert.match(vectors, /B89 rejects a localhost alias with mixed loopback/u);
  assert.match(vectors, /B89 rejects Mongo connection strings with embedded authentication/u);
  assert.match(vectors, /B89 refuses database selection or extra connection options/u);
  assert.match(vectors, /B89 requires a single clean replicaSet/u);
});
check('B89 test runner is wired without allowing opt-out from the lifecycle chain', () => {
  const chain = pkg.scripts['test:account-lifecycle-contract'];
  assert.match(chain, /test-account-export-b89-local-mongo-uri\.test\.mjs/u);
  assert.match(chain, /test-account-export-b89-local-mongo-uri-guard\.mjs/u);
  assert.match(chain, /test-account-export-b87-sigv4\.test\.mjs/u);
  assert.match(pkg.scripts['test:account-export-b86-local-acceptance'],
    /run-account-export-b86-local-acceptance\.mjs/u);
});
check('B89 production flag remains OFF and release still has no waiver', () => {
  assert.match(config, /STUDY_PROGRESS_ENABLED must remain false in production/u);
  assert.match(ops, /B89/u);
});
console.log('B89 safe local Mongo acceptance: ' + passed + ' structural contracts PASS');
