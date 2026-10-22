/**
 * B94: acceptance of the MongoDB + real application S3 adapter must prove
 * the entire B86/B90/B93 safety matrix ran, not merely a successful Jest
 * process or one subset of the test names. Pure and Node-only for audit.
 */
export const B94_MONGO_ACCEPTANCE_CASES = Object.freeze([
  'B86 reconciles lost real S3 writer PUT ACK with B80/B82 Mongo recovery and a 503 DELETE retry',
  'B86 preserves a published generation when B80 queue recovery claims it',
  'B90 refuses to publish corrupt same-size S3 GET bytes and retains B80 recovery intent',
  'B93 Mongo primary authorizes a future artifact even if the worker is ahead',
  'B93 Mongo primary refuses expired and detached private generations',
]);

export const B94_MONGO_TEST_PATTERN = 'B(?:86|90|93) ';
export const B94_MONGO_TEST_PATH =
  'src/study-progress/mongo/study-progress.mongo-int.spec.ts';

const allowed = new Set(B94_MONGO_ACCEPTANCE_CASES);
const selectedName = name =>
  typeof name === 'string' && /B(?:86|90|93) /u.test(name);

function reject(message) {
  throw new Error('B94 Mongo acceptance invalid: ' + message);
}

/** Fail before opening a DB if a protected test was silently renamed or lost. */
export function validateB94MongoAcceptanceSource(source) {
  if (typeof source !== 'string' || !source.trim()) reject('missing test source');
  // No test file evaluation required; only the exact authored Jest titles.
  const titles = [...source.matchAll(/\b(?:it|test)\('([^']+)'/gu)]
    .map(match => match[1])
    .filter(selectedName);
  if (titles.length !== allowed.size || new Set(titles).size !== allowed.size ||
    titles.some(name => !allowed.has(name)) ||
    B94_MONGO_ACCEPTANCE_CASES.some(name => !titles.includes(name))) {
    reject('the selected B86/B90/B93 test inventory differs from the required five');
  }
  return titles.length;
}

/**
 * Jest JSON includes every unselected B61/B63/etc case as pending. Ignore
 * those intentionally, but require exactly five *selected* assertions
 * in the ONE isolated integration file, all PASS, no missing/extra cases.
 * This rejects skipped, todo, renamed, duplicated and failed selections.
 */
export function verifyB94MongoAcceptanceReport(report) {
  if (!report || typeof report !== 'object' ||
    report.success !== true ||
    report.numFailedTests !== 0 ||
    report.numFailedTestSuites !== 0 ||
    report.numRuntimeErrorTestSuites !== 0 ||
    !Array.isArray(report.testResults) ||
    report.testResults.length !== 1) {
    reject('Jest did not report a successful isolated test suite');
  }
  const [suite] = report.testResults;
  if (!suite || typeof suite.name !== 'string' ||
    !suite.name.replace(/\\/gu, '/').endsWith(B94_MONGO_TEST_PATH) ||
    !Array.isArray(suite.assertionResults)) {
    reject('unexpected Jest suite path or malformed test assertions');
  }

  const selected = suite.assertionResults.filter(result =>
    selectedName(result?.title));
  if (selected.length !== allowed.size) {
    reject('selected Jest assertion count is not five');
  }
  const seen = new Set();
  for (const result of selected) {
    if (!allowed.has(result.title) || seen.has(result.title) ||
      result.status !== 'passed' ||
      !Array.isArray(result.failureMessages) ||
      result.failureMessages.length !== 0) {
      reject('a required B86/B90/B93 scenario did not pass exactly once');
    }
    seen.add(result.title);
  }
  if (B94_MONGO_ACCEPTANCE_CASES.some(name => !seen.has(name))) {
    reject('a required Mongo/S3 scenario was not executed');
  }
  return { passed: seen.size, required: B94_MONGO_ACCEPTANCE_CASES.length };
}
