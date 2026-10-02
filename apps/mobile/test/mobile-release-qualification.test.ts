import assert from "node:assert/strict";
import test from "node:test";

import {
  createMobileReleaseIdentity,
  normalizeMobileApiOrigin,
  normalizeMobileSourceSha,
  qualifyMobileRelease,
} from "../src/config/release-qualification";

const SOURCE_SHA = "66688287112fef162e31c0fe3acb46a3c6c669d2";

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
    environment: "development",
    apiOrigin: "http://127.0.0.1:4000",
    sourceSha: SOURCE_SHA,
    appVersion: "0.1.0",
    build: "1",
    distributionProfile: "development",
  });

  assert.equal(identity.apiTransport, "local-http");

  const qualification = qualifyMobileRelease(identity, "api-local");
  assert.equal(qualification.status, "blocked");
  assert.deepEqual(qualification.blockers, [
    "DEVELOPMENT_BUILD",
    "INSECURE_API_ORIGIN",
  ]);
});

test("production qualification rejects insecure non-loopback API targets", () => {
  const identity = createMobileReleaseIdentity({
    environment: "production",
    apiOrigin: "http://api.example.test",
    sourceSha: SOURCE_SHA,
    appVersion: "0.1.0",
    build: "42",
    distributionProfile: "internal",
  });

  const qualification = qualifyMobileRelease(identity, "api-2026.10.02");
  assert.equal(qualification.status, "blocked");
  assert.deepEqual(qualification.blockers, ["INSECURE_API_ORIGIN"]);
});

test("qualification stays blocked while required release evidence is unknown", () => {
  const identity = createMobileReleaseIdentity({
    environment: "production",
    apiOrigin: "https://api.example.test",
    sourceSha: null,
    appVersion: null,
    build: null,
    distributionProfile: null,
  });

  const qualification = qualifyMobileRelease(identity, null);
  assert.equal(qualification.status, "blocked");
  assert.deepEqual(qualification.blockers, [
    "MISSING_SOURCE_SHA",
    "MISSING_APP_VERSION",
    "MISSING_BUILD_ID",
    "MISSING_DISTRIBUTION_PROFILE",
    "MISSING_SERVER_RELEASE_ID",
  ]);
});

test("a production build qualifies only with complete observed evidence", () => {
  const identity = createMobileReleaseIdentity({
    environment: "production",
    apiOrigin: "https://api.example.test",
    sourceSha: SOURCE_SHA,
    appVersion: "0.1.0",
    build: 42,
    distributionProfile: "internal",
  });

  const qualification = qualifyMobileRelease(
    identity,
    "api-2026.10.02-6668828",
  );

  assert.equal(qualification.status, "qualified");
  assert.deepEqual(qualification.blockers, []);
  assert.equal(qualification.identity.sourceSha, SOURCE_SHA);
  assert.equal(qualification.identity.apiOrigin, "https://api.example.test");
  assert.equal(qualification.serverReleaseId, "api-2026.10.02-6668828");
});

test("invalid observed server release text cannot make a build qualified", () => {
  const identity = createMobileReleaseIdentity({
    environment: "production",
    apiOrigin: "https://api.example.test",
    sourceSha: SOURCE_SHA,
    appVersion: "0.1.0",
    build: "42",
    distributionProfile: "internal",
  });

  const qualification = qualifyMobileRelease(
    identity,
    "api release with spaces and private text",
  );

  assert.equal(qualification.status, "blocked");
  assert.equal(qualification.serverReleaseId, null);
  assert.deepEqual(qualification.blockers, ["MISSING_SERVER_RELEASE_ID"]);
});
