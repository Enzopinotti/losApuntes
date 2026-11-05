import { validateB89LocalMongoUri } from "../testing/b89-local-mongo-uri.mjs";

/**
 * B52 private-collection acceptance gate.
 * No Mongo/database mutations, filesystem writes or child-process side effects.
 * The URI validator resolves loopback DNS before the runner starts Jest;
 * the Jest-report checker remains a pure skipped/incomplete-suite guard.
 */

const EXPECTED = Object.freeze([
  "commits all five mutation paths before closure and deletes owner data at closure",
  "refuses every mutation when account closure wins first",
  "deletes only the closing owner and preserves another account's collections",
  "never resurrects a collection when creation and closure start together",
  "never leaves owner documents after edit races a successful closure",
  "never leaves owner documents after add resource races a successful closure",
  "never leaves owner documents after remove resource races a successful closure",
  "never leaves owner documents after delete races a successful closure",
  "keeps the same idempotency key and original collection on replay",
  "rolls back both closure and collection deletion when audit persistence fails",
  "exports only the owner collections with bounded stable pages and no internal fields",
  "retains v2 account portability after rollback and erases closed-owner exports",
  "returns stale revision conflict after concurrent removal shrinks a resource page",
]);

export const REQUIRED_STUDY_MONGO_TEST_NAMES = EXPECTED;

/**
 * B140: the legacy B52 runner must use the already-audited B89 DNS/loopback
 * validator before it can execute destructive Mongo acceptance. The B50
 * fixture intentionally supports only the isolated 127.0.0.1:27017 rs0.
 * B89 pins localhost to a verified numeric address and appends
 * directConnection=true to prevent replica topology redirection.
 */
export async function validateStudyMongoGateUri(uri, options = {}) {
  if (typeof uri !== "string" || uri.length > 2048) {
    throw new Error("A local Mongo replica-set URI is required");
  }
  const pinned = await validateB89LocalMongoUri(uri, options);
  const target = new URL(pinned);
  if (
    target.hostname !== "127.0.0.1" ||
    target.port !== "27017" ||
    target.searchParams.get("replicaSet") !== "rs0" ||
    target.searchParams.get("directConnection") !== "true"
  ) {
    throw new Error("B52 requires the local 127.0.0.1:27017 rs0 replica");
  }
  return pinned;
}

export function validateStudyMongoJestReport(report) {
  if (!report || typeof report !== "object" || Array.isArray(report)) {
    throw new Error("Mongo Jest report is missing");
  }
  if (
    report.success !== true ||
    report.numFailedTests !== 0 ||
    report.numPendingTests !== 0 ||
    report.numPassedTests !== EXPECTED.length ||
    report.numTotalTests !== EXPECTED.length ||
    report.numTotalTestSuites !== 1 ||
    !Array.isArray(report.testResults) ||
    report.testResults.length !== 1
  ) {
    throw new Error("Mongo acceptance suite failed, was skipped or is incomplete");
  }
  const matching = report.testResults.filter(
    (entry) =>
      typeof entry?.name === "string" &&
      entry.name.replaceAll("\\", "/").endsWith(
        "/study-collection-lifecycle.mongo-int.spec.ts",
      ),
  );
  if (matching.length !== 1) {
    throw new Error("Expected exactly one Study Collections Mongo test suite");
  }
  const results = matching[0].assertionResults;
  if (!Array.isArray(results)) {
    throw new Error("Mongo test assertion results are missing");
  }
  const suiteTitle =
    "B50 real Mongo replica-set acceptance: collections vs closure";
  const expectedNames = EXPECTED.map((name) => suiteTitle + " " + name);
  const passed = results.map((entry) => entry?.fullName);
  // Exact full-name and count checks prevent a repeated or similarly named
  // test from masquerading as a missing required acceptance scenario.
  const actual = new Set(passed);
  if (
    results.length !== EXPECTED.length ||
    actual.size !== EXPECTED.length ||
    results.some((entry) => entry?.status !== "passed") ||
    expectedNames.some((name) => !actual.has(name))
  ) {
    throw new Error(
      "Mongo acceptance must pass every unique required test by exact name",
    );
  }
  return {
    passed: results.length,
    required: EXPECTED.length,
    suite: matching[0].name,
  };
}
