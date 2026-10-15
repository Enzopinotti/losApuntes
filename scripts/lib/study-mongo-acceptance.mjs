/**
 * B52 private-collection acceptance gate.
 * No filesystem, network or process access: the runner and unit checks use
 * these pure validators to reject skipped/incomplete suites.
 */

const EXPECTED = Object.freeze([
  "commits all five mutation paths before closure",
  "refuses every mutation when account closure wins first",
  "deletes only the closing owner",
  "never resurrects a collection when creation and closure start together",
  "never leaves owner documents after edit races a successful closure",
  "never leaves owner documents after add resource races a successful closure",
  "never leaves owner documents after remove resource races a successful closure",
  "never leaves owner documents after delete races a successful closure",
  "keeps the same idempotency key and original collection on replay",
  "rolls back both closure and collection deletion when audit persistence fails",
]);

export const REQUIRED_STUDY_MONGO_TEST_NAMES = EXPECTED;

export function validateStudyMongoGateUri(uri) {
  if (typeof uri !== "string" || uri.length > 2048) {
    throw new Error("A local Mongo replica-set URI is required");
  }
  let parsed;
  try {
    parsed = new URL(uri);
  } catch {
    throw new Error("Invalid Mongo acceptance URI");
  }
  const hosts = new Set(["localhost", "127.0.0.1", "mongo"]);
  if (
    parsed.protocol !== "mongodb:" ||
    !hosts.has(parsed.hostname) ||
    parsed.username !== "" ||
    parsed.password !== "" ||
    !parsed.searchParams.get("replicaSet") ||
    (parsed.pathname !== "" && parsed.pathname !== "/") ||
    parsed.hash ||
    parsed.searchParams.get("directConnection") === "true" ||
    parsed.searchParams.get("tls") === "true" ||
    parsed.searchParams.get("ssl") === "true"
  ) {
    throw new Error("Acceptance requires an uncredentialed local Mongo replica set");
  }
  return uri;
}

export function validateStudyMongoJestReport(report) {
  if (!report || typeof report !== "object" || Array.isArray(report)) {
    throw new Error("Mongo Jest report is missing");
  }
  if (
    report.success !== true ||
    report.numFailedTests !== 0 ||
    report.numPendingTests !== 0 ||
    report.numPassedTests < EXPECTED.length ||
    !Array.isArray(report.testResults)
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
  const passed = results
    .filter((entry) => entry?.status === "passed")
    .map((entry) => entry.fullName);
  const missing = EXPECTED.filter(
    (name) => !passed.some((fullName) => fullName.includes(name)),
  );
  if (missing.length > 0 || results.some((entry) => entry?.status !== "passed")) {
    throw new Error(
      "Mongo acceptance missing required passed tests: " + missing.join(", "),
    );
  }
  return {
    passed: passed.length,
    required: EXPECTED.length,
    suite: matching[0].name,
  };
}
