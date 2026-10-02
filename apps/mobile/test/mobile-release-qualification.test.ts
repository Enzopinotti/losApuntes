import assert from "node:assert/strict";
import test from "node:test";

import {
  createMobileReleaseIdentity,
  normalizeMobileApiOrigin,
  normalizeMobileSourceSha,
  qualifyMobileRelease,
  type MobileReleaseIdentityInput,
} from "../src/config/release-qualification";

const SOURCE_SHA = "66688287112fef162e31c0fe3acb46a3c6c669d2";

const productionInput = (
  overrides: Partial<MobileReleaseIdentityInput> = {},
): MobileReleaseIdentityInput => ({
  apiOrigin: "https://api.example.test",
  sourceSha: SOURCE_SHA,
  appVersion: "0.1.0",
  build: "42",
  distributionProfile: "production",
  ...overrides,
});

test("normalizes an exact source SHA and rejects non-SHA release text", () => {
  assert.equal(normalizeMobileSourceSha(SOURCE_SHA.toUpperCase()), SOURCE_SHA);
  assert.equal(normalizeMobileSourceSha("main"), null);
  assert.equal(normalizeMobileSourceSha("secret-release-token"), null);
});

test("rejects API targets with credentials, path, query, hash or non-http protocols", () => {
  const invalid = [
    "https://user:pass@api.example.test",
    "https://api.example.test/v1",
    "https://api.example.test?token=secret",
    "https://api.example.test#fragment",
    "file:///tmp/api.sock",
  ];

  for (const value of invalid) {
    assert.throws(
      () => normalizeMobileApiOrigin(value),
      /absolute HTTP\(S\) origin/u,
    );
  }
});

test("local development HTTP is represented honestly but cannot qualify", () => {
  const identity = createMobileReleaseIdentity({
    apiOrigin: "http://127.0.0.1:4000",
    sourceSha: SOURCE_SHA,
    appVersion: "0.1.0",
    build: "1",
    distributionProfile: "development",
  });

  assert.equal(identity.apiTransport, "local-http");

  const qualification = qualifyMobileRelease(
    {
      apiOrigin: identity.apiOrigin,
      sourceSha: identity.sourceSha,
      appVersion: identity.appVersion,
      build: identity.build,
      distributionProfile: identity.distributionProfile,
    },
    {
      source: "api-observation",
      apiOrigin: "http://127.0.0.1:4000",
      releaseId: "api-local",
    },
  );

  assert.equal(qualification.status, "blocked");
  assert.deepEqual(qualification.blockers, [
    "DEVELOPMENT_BUILD",
    "INSECURE_API_ORIGIN",
  ]);
});

test("unknown distribution profiles fail closed", () => {
  const qualification = qualifyMobileRelease(
    productionInput({ distributionProfile: "internal-dev-client" }),
    {
      source: "api-observation",
      apiOrigin: "https://api.example.test",
      releaseId: "api-2026.10.02",
    },
  );

  assert.equal(qualification.status, "blocked");
  assert.deepEqual(qualification.blockers, ["MISSING_DISTRIBUTION_PROFILE"]);
});

test("qualification stays blocked while required release evidence is unknown", () => {
  const qualification = qualifyMobileRelease(
    {
      apiOrigin: "https://api.example.test",
      sourceSha: null,
      appVersion: null,
      build: null,
      distributionProfile: null,
    },
    null,
  );

  assert.equal(qualification.status, "blocked");
  assert.deepEqual(qualification.blockers, [
    "MISSING_SOURCE_SHA",
    "MISSING_APP_VERSION",
    "MISSING_BUILD_ID",
    "MISSING_DISTRIBUTION_PROFILE",
    "MISSING_SERVER_RELEASE_ID",
  ]);
});

test("a distributed build qualifies only with origin-bound API observation", () => {
  const qualification = qualifyMobileRelease(productionInput(), {
    source: "api-observation",
    apiOrigin: "https://api.example.test",
    releaseId: "api-2026.10.02-6668828",
  });

  assert.equal(qualification.status, "qualified");
  assert.deepEqual(qualification.blockers, []);
  assert.equal(qualification.identity.sourceSha, SOURCE_SHA);
  assert.equal(qualification.identity.apiOrigin, "https://api.example.test");
  assert.deepEqual(qualification.serverRelease, {
    source: "api-observation",
    apiOrigin: "https://api.example.test",
    releaseId: "api-2026.10.02-6668828",
  });
});

test("a bare or guessed server release token cannot qualify", () => {
  const qualification = qualifyMobileRelease(
    productionInput(),
    "main" as never,
  );

  assert.equal(qualification.status, "blocked");
  assert.deepEqual(qualification.blockers, ["MISSING_SERVER_RELEASE_ID"]);
  assert.equal(qualification.serverRelease, null);
});

test("server evidence observed from another origin cannot qualify", () => {
  const qualification = qualifyMobileRelease(productionInput(), {
    source: "api-observation",
    apiOrigin: "https://staging-api.example.test",
    releaseId: "api-2026.10.02-6668828",
  });

  assert.equal(qualification.status, "blocked");
  assert.deepEqual(qualification.blockers, [
    "SERVER_RELEASE_ORIGIN_MISMATCH",
  ]);
});

test("qualification revalidates structural identity input at the boundary", () => {
  const forged = {
    ...productionInput(),
    apiOrigin: "http://attacker.example",
    apiTransport: "https",
  };

  const qualification = qualifyMobileRelease(forged, {
    source: "api-observation",
    apiOrigin: "http://attacker.example",
    releaseId: "api-2026.10.02",
  });

  assert.equal(qualification.status, "blocked");
  assert.deepEqual(qualification.blockers, ["INSECURE_API_ORIGIN"]);
  assert.equal(qualification.identity.apiTransport, "insecure-http");
});

test("invalid observed server release text cannot make a build qualified", () => {
  const qualification = qualifyMobileRelease(productionInput(), {
    source: "api-observation",
    apiOrigin: "https://api.example.test",
    releaseId: "api release with spaces and private text",
  });

  assert.equal(qualification.status, "blocked");
  assert.equal(qualification.serverRelease, null);
  assert.deepEqual(qualification.blockers, ["MISSING_SERVER_RELEASE_ID"]);
});
