import assert from "node:assert/strict";
import {
  REQUIRED_STUDY_MONGO_TEST_NAMES,
  validateStudyMongoGateUri,
  validateStudyMongoJestReport,
} from "./lib/study-mongo-acceptance.mjs";

assert.equal(REQUIRED_STUDY_MONGO_TEST_NAMES.length, 10);
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
  fullName: `B50 real Mongo replica-set acceptance ${part}`,
}));
const complete = {
  success: true,
  numFailedTests: 0,
  numPendingTests: 0,
  numPassedTests: assertions.length,
  testResults: [{ name, assertionResults: assertions }],
};
assert.equal(validateStudyMongoJestReport(complete).passed, 10);
for (const report of [
  null,
  { ...complete, success: false },
  { ...complete, numPassedTests: 0 },
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
]) {
  assert.throws(() => validateStudyMongoJestReport(report));
}
console.log("B52 gate parser / skipped-suite rejection: PASS");
