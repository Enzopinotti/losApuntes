import assert from "node:assert/strict";
import { pathToFileURL } from "node:url";
import path from "node:path";

const SHA40 = /^[a-f0-9]{40}$/iu;
const PUBLIC_VARIABLES = new Set([
  "EXPO_PUBLIC_API_ORIGIN",
  "EXPO_PUBLIC_RELEASE_SHA",
  "EXPO_PUBLIC_DISTRIBUTION_PROFILE",
  "EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID",
  "EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID",
  "EXPO_PUBLIC_GOOGLE_IOS_URL_SCHEME",
  "EXPO_PUBLIC_STUDY_AGENDA_ENABLED",
  "EXPO_PUBLIC_STUDY_COLLECTIONS_ENABLED",
]);

function isRestrictedHostname(hostname) {
  const host = hostname.toLowerCase().replace(/\.$/u, "");
  if (
    host === "localhost" ||
    host === "0.0.0.0" ||
    host === "[::1]" ||
    host.endsWith(".localhost") ||
    host.endsWith(".local") ||
    host.endsWith(".internal") ||
    host.endsWith(".invalid") ||
    host.endsWith(".test") ||
    host === "example.com" ||
    host === "example.org" ||
    host === "example.net" ||
    host.endsWith(".example.com") ||
    host.endsWith(".example.org") ||
    host.endsWith(".example.net")
  ) {
    return true;
  }

  // Deny direct IP literals, including RFC1918, loopback, link-local and
  // IPv4-mapped IPv6. A distributed release must use a reviewed DNS name.
  return /^\d+\.\d+\.\d+\.\d+$/u.test(host) || host.startsWith("[");
}

function validatePublicApiOrigin(raw) {
  assert.ok(
    typeof raw === "string" && raw === raw.trim() && raw.length > 0,
    "EXPO_PUBLIC_API_ORIGIN must be a configured HTTPS origin",
  );
  let url;
  try {
    url = new URL(raw);
  } catch {
    throw new Error("EXPO_PUBLIC_API_ORIGIN must be an absolute HTTPS origin");
  }
  assert.ok(
    url.protocol === "https:" &&
      url.username === "" &&
      url.password === "" &&
      url.pathname === "/" &&
      url.search === "" &&
      url.hash === "" &&
      !isRestrictedHostname(url.hostname),
    "EXPO_PUBLIC_API_ORIGIN must be a public HTTPS origin without credentials or paths",
  );
  assert.equal(
    url.origin,
    raw.replace(/\/$/u, ""),
    "EXPO_PUBLIC_API_ORIGIN must be the canonical HTTPS origin",
  );
  return url.origin;
}

/**
 * Only a release-config preflight. It does NOT observe the API, compile a
 * signed binary, run a dependency audit, or qualify deployment.
 */
export function inspectMobilePublicReleaseEnvironment(env, expectedSourceSha) {
  assert.ok(
    env && typeof env === "object" && !Array.isArray(env),
    "missing Mobile build environment",
  );
  assert.ok(
    typeof expectedSourceSha === "string" && SHA40.test(expectedSourceSha),
    "expected exact source SHA must contain 40 hexadecimal characters",
  );

  for (const name of Object.keys(env)) {
    if (name.startsWith("EXPO_PUBLIC_")) {
      assert.ok(
        PUBLIC_VARIABLES.has(name),
        `unreviewed public Mobile build variable: ${name}`,
      );
    }
  }

  const profile = env.EXPO_PUBLIC_DISTRIBUTION_PROFILE;
  assert.ok(
    profile === "preview" || profile === "production",
    "distributed Mobile build must use preview or production profile",
  );
  const sha = env.EXPO_PUBLIC_RELEASE_SHA;
  assert.ok(
    typeof sha === "string" && SHA40.test(sha),
    "EXPO_PUBLIC_RELEASE_SHA must be a 40-character Git SHA",
  );
  assert.equal(
    sha.toLowerCase(),
    expectedSourceSha.toLowerCase(),
    "embedded Mobile source SHA does not match exact candidate head",
  );
  const apiOrigin = validatePublicApiOrigin(env.EXPO_PUBLIC_API_ORIGIN);

  for (const name of [
    "EXPO_PUBLIC_STUDY_AGENDA_ENABLED",
    "EXPO_PUBLIC_STUDY_COLLECTIONS_ENABLED",
  ]) {
    const value = env[name];
    assert.ok(
      value === undefined ||
        value === "" ||
        value === "true" ||
        value === "false",
      `${name} must be an explicit boolean if present`,
    );
  }

  const iosClientId = env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID;
  const iosScheme = env.EXPO_PUBLIC_GOOGLE_IOS_URL_SCHEME;
  assert.ok(
    Boolean(iosClientId) === Boolean(iosScheme),
    "Google iOS Client ID and URL scheme must be configured together",
  );
  if (iosScheme !== undefined && iosScheme !== "") {
    assert.ok(
      typeof iosScheme === "string" &&
        /^[A-Za-z0-9.-]{1,256}$/u.test(iosScheme),
      "Google iOS URL scheme must be bounded and contain no URL/userinfo",
    );
  }

  // Retain the product's independent backend authority fence from #353.
  assert.notEqual(
    env.STUDY_PROGRESS_ENABLED,
    "true",
    "Study Progress backend authority remains release-disabled",
  );
  assert.ok(apiOrigin.startsWith("https://"), "HTTPS transport required");

  return {
    event: "mobile.release_public_environment.preflight_passed",
    profile,
    sourceSha: sha.toLowerCase(),
    apiTransport: "https",
    publicVariablesReviewed: Object.keys(env).filter((key) =>
      key.startsWith("EXPO_PUBLIC_"),
    ).length,
    productionAuditCertified: false,
    serverReleaseObserved: false,
    nativeBinaryValidated: false,
    releaseAuthorized: false,
  };
}

if (
  process.argv[1] &&
  pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url
) {
  assert.equal(
    process.argv.length,
    3,
    "usage: node check-mobile-release-public-env.mjs <exact-40-character-head-sha>",
  );
  console.log(
    JSON.stringify(
      inspectMobilePublicReleaseEnvironment(process.env, process.argv[2]),
    ),
  );
}
