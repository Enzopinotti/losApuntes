import assert from "node:assert/strict";
import {
  REQUIRED_STUDY_MONGO_TEST_NAMES,
  validateStudyMongoGateUri,
  validateStudyMongoJestReport,
} from "./lib/study-mongo-acceptance.mjs";

assert.equal(REQUIRED_STUDY_MONGO_TEST_NAMES.length, 13);
for (const uri of [
  "mongodb://127.0.0.1:27017/?replicaSet=rs0",
  "mongodb://localhost:27017/?replicaSet=rs0",
  "mongodb://mongo:27017/?replicaSet=rs0",
]) {
  assert.equal(validateStudyMongoGateUri(uri), uri);
}
for (const uri of [
  undefined,
  "mongodb://mongo:27017/",
  "mongodb://user:password@localhost:27017/?replicaSet=rs0",
  "mongodb://remote.example:27017/?replicaSet=rs0",
  "mongodb://localhost:27017/private?replicaSet=rs0",
  "mongodb://localhost:27017/?replicaSet=rs0&directConnection=true",
  "mongodb+srv://localhost/?replicaSet=rs0",
  "https://localhost:27017/?replicaSet=rs0",
]) {
  assert.throws(() => validateStudyMongoGateUri(uri));
}

const name = "/workspace/apps/api/src/study-collections/mongo/study-collection-lifecycle.mongo-int.spec.ts";
const assertions = REQUIRED_STUDY_MONGO_TEST_NAMES.map((part) => ({
  status: "passed",
  fullName: `B50 real Mongo replica-set acceptance: collections vs closure ${part}`,
}));
const complete = {
  success: true,
  numFailedTests: 0,
  numPendingTests: 0,
  numPassedTests: assertions.length,
  numTotalTests: assertions.length,
  numTotalTestSuites: 1,
  testResults: [{ name, assertionResults: assertions }],
};
assert.equal(validateStudyMongoJestReport(complete).passed, 13);
for (const report of [
  null,
  { ...complete, success: false },
  { ...complete, numPassedTests: 0 },
  { ...complete, numPassedTests: assertions.length + 1 },
  { ...complete, numTotalTests: assertions.length + 1 },
  { ...complete, numTotalTestSuites: 2 },
  { ...complete, numPendingTests: 1 },
  { ...complete, numFailedTests: 1 },
  { ...complete, testResults: [] },
  { ...complete, testResults: [{ name, assertionResults: [] }] },
  { ...complete, testResults: [{
    name, assertionResults: assertions.map((a, i) =>
      i === 0 ? { ...a, status: "pending" } : a),
  }] },
  { ...complete, testResults: [{
    name, assertionResults: assertions.slice(0, -1),
  }] },
  // Duplicate passed tests are not valid replacements for a missing case.
  { ...complete, testResults: [{
    name, assertionResults: [...assertions.slice(0, -1), assertions[0]],
  }] },
  // Prefix/suffix or substring matches cannot masquerade as exact names.
  { ...complete, testResults: [{
    name, assertionResults: [
      ...assertions.slice(0, -1),
      { ...assertions.at(-1), fullName: `FAKE ${assertions.at(-1).fullName}` },
    ],
  }] },
  { ...complete, testResults: [{
    name, assertionResults: [
      ...assertions.slice(0, -1),
      { ...assertions.at(-1), fullName: assertions.at(-1).fullName + " extra" },
    ],
  }] },
  { ...complete, testResults: [
    { name, assertionResults: assertions },
    { name: "/workspace/another.spec.ts", assertionResults: [] },
  ] },
]) {
  assert.throws(() => validateStudyMongoJestReport(report));
}
console.log("B52 gate parser / skipped-suite rejection: PASS");
