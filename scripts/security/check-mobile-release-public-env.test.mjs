import assert from "node:assert/strict";
import test from "node:test";

import { inspectMobilePublicReleaseEnvironment } from "./check-mobile-release-public-env.mjs";

const SHA = "ab".repeat(20);
const valid = () => ({
  EXPO_PUBLIC_API_ORIGIN: "https://api.losapuntes.dev",
  EXPO_PUBLIC_RELEASE_SHA: SHA,
  EXPO_PUBLIC_DISTRIBUTION_PROFILE: "preview",
  EXPO_PUBLIC_STUDY_AGENDA_ENABLED: "false",
  EXPO_PUBLIC_STUDY_COLLECTIONS_ENABLED: "false",
  STUDY_PROGRESS_ENABLED: "false",
});

test("accepts a bounded HTTPS preview configuration but never approves release", () => {
  assert.deepEqual(inspectMobilePublicReleaseEnvironment(valid(), SHA), {
    event: "mobile.release_public_environment.preflight_passed",
    profile: "preview",
    sourceSha: SHA,
    apiTransport: "https",
    publicVariablesReviewed: 5,
    productionAuditCertified: false,
    serverReleaseObserved: false,
    nativeBinaryValidated: false,
    releaseAuthorized: false,
  });
  const production = inspectMobilePublicReleaseEnvironment(
    {
      ...valid(),
      EXPO_PUBLIC_DISTRIBUTION_PROFILE: "production",
    },
    SHA,
  );
  assert.equal(production.profile, "production");
  assert.equal(production.releaseAuthorized, false);
});

test("requires a matching exact 40-character build source SHA", () => {
  for (const mutation of [
    { EXPO_PUBLIC_RELEASE_SHA: undefined },
    { EXPO_PUBLIC_RELEASE_SHA: "deadbeef" },
    { EXPO_PUBLIC_RELEASE_SHA: "cd".repeat(20) },
  ]) {
    assert.throws(
      () =>
        inspectMobilePublicReleaseEnvironment(
          {
            ...valid(),
            ...mutation,
          },
          SHA,
        ),
      /source SHA|Git SHA/u,
    );
  }
  assert.throws(
    () => inspectMobilePublicReleaseEnvironment(valid(), "unknown"),
    /40 hexadecimal/u,
  );
});

test("rejects development profiles and missing distribution profiles", () => {
  for (const profile of [
    undefined,
    "",
    "development",
    "staging",
    "Production",
  ]) {
    assert.throws(
      () =>
        inspectMobilePublicReleaseEnvironment(
          {
            ...valid(),
            EXPO_PUBLIC_DISTRIBUTION_PROFILE: profile,
          },
          SHA,
        ),
      /preview or production/u,
    );
  }
});

test("rejects missing, unauthenticated or credential-bearing API endpoints", () => {
  for (const origin of [
    undefined,
    "",
    "http://api.losapuntes.dev",
    "https://u:p@api.losapuntes.dev",
    "https://api.losapuntes.dev/path",
    "https://api.losapuntes.dev/?x=1",
    "https://api.losapuntes.dev/#fragment",
    "https://api.losapuntes.dev:443",
    " https://api.losapuntes.dev",
    "javascript:alert(1)",
    "data:text/plain,test",
  ]) {
    assert.throws(
      () =>
        inspectMobilePublicReleaseEnvironment(
          {
            ...valid(),
            EXPO_PUBLIC_API_ORIGIN: origin,
          },
          SHA,
        ),
      /EXPO_PUBLIC_API_ORIGIN/u,
    );
  }
});

test("rejects development-only origins and IP literal endpoints", () => {
  for (const origin of [
    "https://localhost",
    "https://127.0.0.1:4000",
    "https://10.0.0.12",
    "https://192.168.1.1",
    "https://[::1]",
    "https://api.local",
    "https://api.invalid",
    "https://api.test",
    "https://example.org",
    "https://api.example.com",
  ]) {
    assert.throws(
      () =>
        inspectMobilePublicReleaseEnvironment(
          {
            ...valid(),
            EXPO_PUBLIC_API_ORIGIN: origin,
          },
          SHA,
        ),
      /public HTTPS origin/u,
    );
  }
});

test("fails closed for accidental EXPO_PUBLIC secrets and unknown variables", () => {
  for (const name of [
    "EXPO_PUBLIC_GOOGLE_CLIENT_SECRET",
    "EXPO_PUBLIC_JWT_SECRET",
    "EXPO_PUBLIC_PRIVATE_KEY",
    "EXPO_PUBLIC_TOKEN",
  ]) {
    const env = { ...valid(), [name]: "do-not-log-its-value" };
    assert.throws(
      () => inspectMobilePublicReleaseEnvironment(env, SHA),
      new RegExp(`unreviewed public Mobile build variable: ${name}`, "u"),
    );
  }
});

test("accepts known Google OAuth public IDs but requires complete iOS scheme pair", () => {
  const complete = {
    ...valid(),
    EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID: "public-id.apps.googleusercontent.com",
    EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID:
      "ios-public-id.apps.googleusercontent.com",
    EXPO_PUBLIC_GOOGLE_IOS_URL_SCHEME:
      "com.googleusercontent.apps.ios-public-id",
  };
  assert.equal(
    inspectMobilePublicReleaseEnvironment(complete, SHA)
      .publicVariablesReviewed,
    8,
  );
  assert.throws(
    () =>
      inspectMobilePublicReleaseEnvironment(
        {
          ...complete,
          EXPO_PUBLIC_GOOGLE_IOS_URL_SCHEME: undefined,
        },
        SHA,
      ),
    /must be configured together/u,
  );
  assert.throws(
    () =>
      inspectMobilePublicReleaseEnvironment(
        {
          ...complete,
          EXPO_PUBLIC_GOOGLE_IOS_URL_SCHEME: "https://evil.example/path",
        },
        SHA,
      ),
    /must be bounded/u,
  );
});

test("requires native study flags to be explicit booleans and preserves backend hold", () => {
  for (const enabled of ["TRUE", "yes", "1", "0"]) {
    assert.throws(
      () =>
        inspectMobilePublicReleaseEnvironment(
          {
            ...valid(),
            EXPO_PUBLIC_STUDY_AGENDA_ENABLED: enabled,
          },
          SHA,
        ),
      /explicit boolean/u,
    );
  }
  assert.throws(
    () =>
      inspectMobilePublicReleaseEnvironment(
        {
          ...valid(),
          STUDY_PROGRESS_ENABLED: "true",
        },
        SHA,
      ),
    /release-disabled/u,
  );
});

test("diagnostics never include API origin values or environment secret values", () => {
  const sensitive = "not-for-logs-sensitive-value";
  assert.throws(
    () =>
      inspectMobilePublicReleaseEnvironment(
        {
          ...valid(),
          EXPO_PUBLIC_BROKEN_SECRET: sensitive,
        },
        SHA,
      ),
    (error) => {
      assert.ok(!error.message.includes(sensitive));
      assert.ok(!error.message.includes("api.losapuntes.dev"));
      return true;
    },
  );
});
