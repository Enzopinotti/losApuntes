import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = (path) =>
  readFileSync(new URL("../" + path, import.meta.url), "utf8");
const controller = source(
  "apps/api/src/study-progress/study-progress.controller.ts",
);
const auth = source("apps/api/src/auth/guards/auth-session.guard.ts");
const feature = source(
  "apps/api/src/study-progress/study-progress.feature.guard.ts",
);
const runtime = source("apps/api/src/config/runtime-environment.ts");
const suite = source(
  "apps/api/src/study-progress/study-progress.http-contract.spec.ts",
);

test("B217 HTTP guards preserve private cache headers", () => {
  assert.match(
    controller,
    /@UseGuards\(AuthSessionGuard, StudyProgressFeatureGuard\)/u,
  );
  const privateHeaders =
    controller.match(/@Header\('Cache-Control', 'private, no-store'\)/gu) ?? [];
  assert.equal(privateHeaders.length, 3);
  assert.match(controller, /req\.user\.id, subjectId/u);
  assert.doesNotMatch(controller, /@Body\(\).*ownerUserId/u);
});

test("B217 release gate and real auth cannot be stubbed", () => {
  assert.match(feature, /get<boolean>\('STUDY_PROGRESS_ENABLED'\) !== true/u);
  assert.match(runtime, /STUDY_PROGRESS_ENABLED: parseBoolean\(/u);
  assert.match(auth, /presentedSessionCredential\(/u);
  assert.match(auth, /isAccountActive\(user\)/u);
  assert.match(auth, /credentialVersion\(user\)/u);
  assert.match(suite, /\bAuthSessionGuard,/u);
  assert.match(suite, /\bStudyProgressFeatureGuard,/u);
  assert.doesNotMatch(suite, /overrideGuard\(AuthSessionGuard\)/u);
  assert.doesNotMatch(suite, /STUDY_PROGRESS_ENABLED\s*[:=]\s*'true'/u);
});

test("B217 exercises two owners, Web and Mobile transports", () => {
  assert.match(suite, /createSessionToken\(\)/u);
  assert.match(suite, /Promise\.all\(\[/u);
  assert.match(suite, /sessions\.resolve/u);
  assert.match(suite, /sessions\.revokeCurrent/u);
  for (const pattern of [
    /ownerA/u,
    /ownerB/u,
    /cookie: true/u,
    /method: 'GET'/u,
    /method: 'PUT'/u,
    /method: 'DELETE'/u,
    /expect\(result\.statusCode\)\.toBe\(503\)/u,
    /expect\(result\.statusCode\)\.toBe\(401\)/u,
    /expect\(restricted\.statusCode\)\.toBe\(403\)/u,
    /expect\(response\.statusCode\)\.toBe\(400\)/u,
    /expect\(conflict\.statusCode\)\.toBe\(409\)/u,
  ]) {
    assert.match(suite, pattern);
  }
});

test("B217 fixture never connects to live storage", () => {
  assert.doesNotMatch(
    suite,
    /MongoClient|createConnection|mongoose\.connect|http:\/\/localhost|listen\(/u,
  );
  assert.match(suite, /getInstance\(\)\s*\.inject\(/u);
  assert.match(suite, /configureHttpRuntime\(/u);
  assert.match(suite, /jest\.fn\(/u);
});
