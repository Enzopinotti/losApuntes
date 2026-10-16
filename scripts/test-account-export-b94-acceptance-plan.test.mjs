import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import {
  B94_MONGO_ACCEPTANCE_CASES,
  B94_MONGO_TEST_PATH,
  B94_MONGO_TEST_PATTERN,
  validateB94MongoAcceptanceSource,
  verifyB94MongoAcceptanceReport,
} from './testing/b94-mongo-acceptance-plan.mjs';

const expected = [...B94_MONGO_ACCEPTANCE_CASES];
const source = () => readFileSync(
  new URL('../apps/api/' + B94_MONGO_TEST_PATH, import.meta.url), 'utf8',
);
const result = (name, status = 'passed') => ({
  title: name, fullName: 'B61 private progress acceptance ' + name,
  status, failureMessages: [],
});
const report = (assertions = expected.map(name => result(name))) => ({
  success: true,
  numFailedTests: 0,
  numFailedTestSuites: 0,
  numRuntimeErrorTestSuites: 0,
  testResults: [{
    name: '/repo/apps/api/' + B94_MONGO_TEST_PATH,
    status: 'passed',
    assertionResults: [
      { title: 'B61 skipped unrelated test', status: 'pending', failureMessages: [] },
      ...assertions,
    ],
  }],
});

test('B94 all five real B86/B90/B93 scenarios exist in the Mongo spec', () => {
  assert.equal(validateB94MongoAcceptanceSource(source()), 5);
  assert.equal(expected.length, 5);
});

test('B94 strict selection includes all three blocks and no unscoped tests', () => {
  const selector = new RegExp(B94_MONGO_TEST_PATTERN, 'u');
  for (const name of expected) assert.match(name, selector);
  assert.doesNotMatch('B85 unrelated Mongo clock work', selector);
  assert.doesNotMatch('B61 unrelated progress tests', selector);
});

test('B94 accepts exactly five passed integration assertions', () => {
  assert.deepEqual(verifyB94MongoAcceptanceReport(report()), {
    passed: 5, required: 5,
  });
});

test('B94 unrelated intentionally unselected Jest pending assertions are ignored', () => {
  assert.equal(verifyB94MongoAcceptanceReport(report()).passed, 5);
});

test('B94 a missing B90 case makes Jest exit-zero evidence invalid', () => {
  assert.throws(
    () => verifyB94MongoAcceptanceReport(
      report(expected.filter(n => n.startsWith('B86') || n.startsWith('B93'))
        .map(n => result(n))),
    ),
    /selected Jest assertion count/u,
  );
});

test('B94 a selected test that Jest skips fails acceptance', () => {
  const data = expected.map((name, i) =>
    result(name, i === 2 ? 'pending' : 'passed'));
  assert.throws(
    () => verifyB94MongoAcceptanceReport(report(data)),
    /did not pass exactly once/u,
  );
});

test('B94 a selected failing test fails acceptance even if summary says success', () => {
  const data = expected.map((name, i) =>
    result(name, i === 1 ? 'failed' : 'passed'));
  assert.throws(
    () => verifyB94MongoAcceptanceReport(report(data)),
    /did not pass exactly once/u,
  );
});

test('B94 duplicated assertion cannot substitute for an absent case', () => {
  const data = expected.map(name => result(name));
  data[4] = result(expected[0]);
  assert.throws(
    () => verifyB94MongoAcceptanceReport(report(data)),
    /did not pass exactly once/u,
  );
});

test('B94 rejects a new or renamed selected case until manifest is reviewed', () => {
  const data = expected.map(name => result(name));
  data[4] = result('B94 unreviewed new scenario');
  assert.throws(
    () => verifyB94MongoAcceptanceReport(report(data)),
    /selected Jest assertion count/u,
  );
});

test('B94 wrong suite path cannot claim Mongo acceptance', () => {
  const invalid = report();
  invalid.testResults[0].name = '/tmp/fake-mongo.spec.ts';
  assert.throws(
    () => verifyB94MongoAcceptanceReport(invalid),
    /unexpected Jest suite path/u,
  );
});

test('B94 denies absent or malformed and unsuccessful Jest reports', () => {
  for (const invalid of [
    null, undefined, {}, { ...report(), success: false },
    { ...report(), numFailedTests: 1 },
    { ...report(), testResults: [] },
    { ...report(), testResults: [report().testResults[0], report().testResults[0]] },
  ]) assert.throws(
    () => verifyB94MongoAcceptanceReport(invalid),
    /Jest did not report/u,
  );
});

test('B94 source inventory fails closed if one protected test is missing', () => {
  const original = source();
  assert.throws(
    () => validateB94MongoAcceptanceSource(
      original.replace('B90 refuses to publish corrupt same-size S3 GET bytes',
        'B90 renamed no longer verified GET bytes'),
    ),
    /test inventory differs/u,
  );
});

test('B94 source inventory rejects duplicates and extra selected assertions', () => {
  const original = source();
  const title = expected[0];
  assert.throws(
    () => validateB94MongoAcceptanceSource(
      original + "\nit('" + title + "', async () => {});\n",
    ),
    /test inventory differs/u,
  );
  assert.throws(
    () => validateB94MongoAcceptanceSource(
      original + "\nit('B93 unreviewed extra scenario', async () => {});\n",
    ),
    /test inventory differs/u,
  );
});

test('B94 no skipped, absent or fake assertion can upgrade Mongo acceptance', () => {
  const selected = expected.map((name) => result(name));
  selected[2].failureMessages = ['readback corrupted'];
  assert.throws(
    () => verifyB94MongoAcceptanceReport(report(selected)),
    /did not pass exactly once/u,
  );
});
