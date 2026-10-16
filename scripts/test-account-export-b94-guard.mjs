import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import {
  B94_MONGO_ACCEPTANCE_CASES,
  B94_MONGO_TEST_PATTERN,
  validateB94MongoAcceptanceSource,
} from './testing/b94-mongo-acceptance-plan.mjs';

const read = path => readFileSync(new URL('../' + path, import.meta.url), 'utf8');
const runner = read('scripts/run-account-export-b86-local-acceptance.mjs');
const spec = read('apps/api/src/study-progress/mongo/study-progress.mongo-int.spec.ts');
const pkg = JSON.parse(read('package.json')).scripts;
const helper = read('scripts/testing/b94-mongo-acceptance-plan.mjs');
const ops = read('docs/operations/account-export-artifacts.md');
let n = 0;
function check(name, fn) { fn(); console.log('PASS ' + name); n++; }

check('B94 5 named opt-in real Mongo/S3 tests still exist', () => {
  assert.equal(validateB94MongoAcceptanceSource(spec), 5);
  assert.equal(B94_MONGO_ACCEPTANCE_CASES.length, 5);
});
check('B94 runner includes B86, B90 and B93 instead of just B86', () => {
  assert.match(B94_MONGO_TEST_PATTERN, /86/u);
  assert.match(B94_MONGO_TEST_PATTERN, /90/u);
  assert.match(B94_MONGO_TEST_PATTERN, /93/u);
  assert.match(runner, /'--testNamePattern', B94_MONGO_TEST_PATTERN/u);
});
check('B94 checks test file before attempting Mongo/Jest execution', () => {
  const inventory = runner.indexOf('validateB94MongoAcceptanceSource(readFileSync(');
  const spawn = runner.indexOf("spawnSync('pnpm', args");
  assert.ok(inventory > 0 && spawn > inventory);
});
check('B94 keeps B89 numeric-IP DNS gate before Jest spawn', () => {
  assert.match(runner, /await validateB89LocalMongoUri\(uri\)/u);
  assert.match(runner, /STUDY_PROGRESS_TEST_MONGO_URI: safeUri/u);
  assert.match(runner, /STUDY_PROGRESS_ENABLED === 'true'/u);
  assert.match(runner, /process\.versions\.node\.split/u);
});
check('B94 writes an explicit temporary Jest JSON report', () => {
  assert.match(runner, /mkdtempSync\(join\(tmpdir\(\)/u);
  assert.match(runner, /'--json', '--outputFile', reportPath/u);
  assert.match(runner, /rmSync\(outputDirectory, \{ recursive: true, force: true \}\)/u);
});
check('B94 cannot claim PASS for Jest exit 0 with skipped assertions', () => {
  assert.match(runner, /verifyB94MongoAcceptanceReport\(report\)/u);
  assert.match(helper, /result\.status !== 'passed'/u);
  assert.match(helper, /selected\.length !== allowed\.size/u);
  assert.match(runner, /process\.exitCode = 2/u);
});
check('B94 preserves Jest execution failure and refuses malformed output', () => {
  assert.match(runner, /run\.error \|\| run\.status !== 0/u);
  assert.match(runner, /JSON\.parse\(readFileSync\(reportPath, 'utf8'\)\)/u);
  assert.match(runner, /--passWithNoTests=false/u);
});
check('B94 acceptance and Node contract are included in lifecycle chain', () => {
  assert.match(pkg['test:account-lifecycle-contract'],
    /test-account-export-b94-acceptance-plan\.test\.mjs/u);
  assert.match(pkg['test:account-lifecycle-contract'],
    /test-account-export-b94-guard\.mjs/u);
  assert.match(pkg['test:account-export-b86-local-acceptance'],
    /run-account-export-b86-local-acceptance\.mjs/u);
});
check('B94 does not run a remote S3 provider or allow release flag', () => {
  assert.doesNotMatch(runner, /https:\/\/s3\.amazonaws\.com/u);
  assert.match(runner, /STUDY_PROGRESS_ENABLED: 'false'/u);
  assert.match(ops, /## B94/u);
});
console.log('B94 Mongo acceptance proof: ' + n + ' structural checks PASS');
