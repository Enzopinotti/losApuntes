import assert from "node:assert/strict";
import {
  REQUIRED_STUDY_MONGO_TEST_NAMES,
  validateStudyMongoGateUri,
  validateStudyMongoJestReport,
} from "./lib/study-mongo-acceptance.mjs";

assert.equal(REQUIRED_STUDY_MONGO_TEST_NAMES.length, 13);
const source = "mongodb://127.0.0.1:27017/?replicaSet=rs0";
const pinned = source + "&directConnection=true";
const loopbackLookup = async () => [{ address: "127.0.0.1", family: 4 }];

assert.equal(await validateStudyMongoGateUri(source), pinned);
assert.equal(
  await validateStudyMongoGateUri("mongodb://localhost:27017/?replicaSet=rs0", {
    lookupHost: loopbackLookup,
  }),
  pinned,
);

for (const uri of [
  undefined,
  "mongodb://mongo:27017/?replicaSet=rs0",
  "mongodb://mongo:27017/",
  "mongodb://user:password@localhost:27017/?replicaSet=rs0",
  "mongodb://remote.example:27017/?replicaSet=rs0",
  "mongodb://127.0.0.1:27018/?replicaSet=rs0",
  "mongodb://127.0.0.1:27017/?replicaSet=not-rs0",
  "mongodb://127.0.0.1:27017/private?replicaSet=rs0",
  source + "&directConnection=true",
  source + "&directConnection=false",
  source + "&replicaSet=rs0",
  source + "&authSource=admin",
  source + "&readPreference=secondary",
  source + "&tls=true",
  "mongodb+srv://localhost/?replicaSet=rs0",
  "https://localhost:27017/?replicaSet=rs0",
]) {
  await assert.rejects(
    validateStudyMongoGateUri(uri, { lookupHost: loopbackLookup }),
  );
}

// A friendly hostname resolving outside loopback is not a local test target.
await assert.rejects(
  validateStudyMongoGateUri("mongodb://localhost:27017/?replicaSet=rs0", {
    lookupHost: async () => [
      { address: "127.0.0.1", family: 4 },
      { address: "10.20.30.40", family: 4 },
    ],
  }),
);
await assert.rejects(
  validateStudyMongoGateUri("mongodb://localhost:27017/?replicaSet=rs0", {
    lookupHost: async () => [{ address: "::1", family: 6 }],
  }),
);

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
