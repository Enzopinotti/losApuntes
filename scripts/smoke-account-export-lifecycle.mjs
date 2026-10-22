import assert from "node:assert/strict";

const baseUrl =
  process.env.LOSAPUNTES_SMOKE_BASE_URL ?? "http://127.0.0.1:4000";

const REQUEST_TIMEOUT_MS = 5_000;
const EXPORT_TIMEOUT_MS = 90_000;
const EXPORT_POLL_INTERVAL_MS = 750;
const MAX_SMOKE_EXPORT_BYTES = 32 * 1024 * 1024;
const ARTIFACT_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const EXPECTED_SECTION_COUNTS = Object.freeze({ 1: 30, 2: 31, 3: 32 });
const countFor = (version) => EXPECTED_SECTION_COUNTS[version];
const PUBLIC_STATUS_FIELDS = [
  "downloadExpiresAt",
  "downloadable",
  "failureCode",
  "format",
  "formatVersion",
  "id",
  "requestedAt",
  "state",
];
const EXPORT_JOB_STATES = new Set([
  "pending",
  "processing",
  "failed",
  "completed",
]);
const EXPORT_FAILURE_CODES = new Set([
  "ACCOUNT_EXPORT_ACCOUNT_INACTIVE",
  "EXPORT_ASSEMBLY_RETRY",
  "EXPORT_RETRY_EXHAUSTED",
]);
const CREDENTIAL_OR_STORAGE_FIELDS = new Set([
  "password",
  "passwordhash",
  "credential",
  "credentials",
  "authorization",
  "token",
  "sessiontoken",
  "actiontoken",
  "authtoken",
  "accesstoken",
  "refreshtoken",
  "providertoken",
  "provideraccesstoken",
  "providerrefreshtoken",
  "cookie",
  "secret",
  "secretaccesskey",
  "accesskeyid",
  "objectkey",
  "objectversionid",
  "storagekey",
  "storagebucket",
  "storageendpoint",
  "signedurl",
  "etag",
]);

const credentials = {
  email: "runtime-smoke@example.test",
  password: "runtime-smoke-authenticated-change-2026",
};

function jsonRequest(method, body) {
  return {
    method,
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  };
}

async function requestJson(path, options = {}) {
  const response = await fetch(new URL(path, baseUrl), {
    ...options,
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  const text = await response.text();
  return { response, body: text.length > 0 ? JSON.parse(text) : null };
}

function assertNoCredentialOrStorageFields(value) {
  if (Array.isArray(value)) {
    for (const item of value) assertNoCredentialOrStorageFields(item);
    return;
  }

  if (!value || typeof value !== "object") return;

  for (const [key, child] of Object.entries(value)) {
    const normalizedKey = key.replace(/[_-]/gu, "").toLowerCase();
    assert.equal(
      CREDENTIAL_OR_STORAGE_FIELDS.has(normalizedKey),
      false,
      `account export must exclude credential/storage field ${normalizedKey}`,
    );
    assertNoCredentialOrStorageFields(child);
  }
}

function assertPublicStatus(status) {
  assert.ok(status && typeof status === "object" && !Array.isArray(status));
  assert.deepEqual(Object.keys(status).sort(), PUBLIC_STATUS_FIELDS);
  assert.match(
    status.id ?? "",
    /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu,
  );
  assert.equal(status.format, "los-apuntes-account-export");
  assert.ok([1, 2, 3].includes(status.formatVersion));
  assert.ok(EXPORT_JOB_STATES.has(status.state));
  assert.ok(
    status.failureCode === null || EXPORT_FAILURE_CODES.has(status.failureCode),
  );
  assert.ok(Number.isFinite(Date.parse(status.requestedAt)));
  assert.ok(
    status.downloadExpiresAt === null ||
      Number.isFinite(Date.parse(status.downloadExpiresAt)),
  );
  assert.equal(typeof status.downloadable, "boolean");
  assertNoCredentialOrStorageFields(status);
}

async function waitForCompletion(exportId, authorization) {
  const deadline = Date.now() + EXPORT_TIMEOUT_MS;
  let status;

  while (Date.now() < deadline) {
    const current = await requestJson(`/account/exports/${exportId}`, {
      headers: { authorization },
    });
    assert.equal(current.response.status, 200, "owner status must be readable");
    assertPublicStatus(current.body);
    assert.equal(current.body.id, exportId);

    if (current.body.state === "failed") {
      throw new Error(
        `runtime account export failed with ${current.body.failureCode ?? "unknown code"}`,
      );
    }

    if (current.body.state === "completed") {
      status = current.body;
      break;
    }

    await new Promise((resolve) =>
      setTimeout(resolve, EXPORT_POLL_INTERVAL_MS),
    );
  }

  assert.ok(
    status,
    "account export worker must complete within the smoke deadline",
  );
  return status;
}

async function consumeBoundedBody(response, expectedByteLength) {
  assert.ok(
    response.body,
    "account export download must return a readable body",
  );
  const reader = response.body.getReader();
  const chunks = [];
  let byteLength = 0;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      byteLength += value.byteLength;
      if (byteLength > MAX_SMOKE_EXPORT_BYTES) {
        await reader.cancel();
        throw new Error(
          "synthetic runtime export exceeded the smoke payload cap",
        );
      }
      chunks.push(Buffer.from(value));
    }
  } finally {
    reader.releaseLock();
  }

  assert.equal(byteLength, expectedByteLength);
  return Buffer.concat(chunks, byteLength);
}

const login = await requestJson(
  "/auth/mobile/login",
  jsonRequest("POST", credentials),
);
assert.equal(
  login.response.status,
  200,
  "synthetic runtime account must authenticate",
);
assert.equal(login.body.user.email, credentials.email);
assert.equal(typeof login.body.sessionToken, "string");
assert.ok(login.body.sessionToken.length > 0);
const authorization = `Bearer ${login.body.sessionToken}`;

const unauthenticatedRequest = await requestJson("/account/exports", {
  method: "POST",
});
assert.equal(unauthenticatedRequest.response.status, 401);
assert.equal(unauthenticatedRequest.body.code, "AUTHENTICATION_REQUIRED");

const request = await requestJson("/account/exports", {
  method: "POST",
  headers: { authorization },
});
assert.equal(
  request.response.status,
  202,
  "account export request must be accepted",
);
assert.equal(typeof request.body.created, "boolean");
assertPublicStatus(request.body.export);
assertNoCredentialOrStorageFields(request.body);
const initialExportId = request.body.export?.id;
assert.match(
  initialExportId ?? "",
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu,
);

const unauthenticatedStatus = await requestJson(
  `/account/exports/${initialExportId}`,
);
assert.equal(unauthenticatedStatus.response.status, 401);
assert.equal(unauthenticatedStatus.body.code, "AUTHENTICATION_REQUIRED");
assert.equal("export" in unauthenticatedStatus.body, false);
assertNoCredentialOrStorageFields(unauthenticatedStatus.body);

const unauthenticatedDownload = await fetch(
  new URL(`/account/exports/${initialExportId}/download`, baseUrl),
  { signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) },
);
assert.equal(unauthenticatedDownload.status, 401);
assert.equal(unauthenticatedDownload.headers.get("location"), null);
const unauthenticatedDownloadBody = await unauthenticatedDownload.json();
assert.equal(unauthenticatedDownloadBody.code, "AUTHENTICATION_REQUIRED");
assertNoCredentialOrStorageFields(unauthenticatedDownloadBody);

const replay = await requestJson("/account/exports", {
  method: "POST",
  headers: { authorization },
});
assert.equal(replay.response.status, 202);
assertPublicStatus(replay.body.export);
assertNoCredentialOrStorageFields(replay.body);
let exportId = initialExportId;
let requestReplayOutcome;
if (replay.body.created === false) {
  assert.equal(replay.body.export?.id, initialExportId);
  requestReplayOutcome = "active_job_replayed";
} else {
  assert.equal(replay.body.created, true);
  const priorStatus = await requestJson(`/account/exports/${initialExportId}`, {
    headers: { authorization },
  });
  assert.equal(priorStatus.response.status, 200);
  assert.equal(
    priorStatus.body.state,
    "completed",
    "a new job after the first request is valid only if that export already completed",
  );
  exportId = replay.body.export?.id;
  assert.match(
    exportId ?? "",
    /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu,
  );
  assert.notEqual(exportId, initialExportId);
  requestReplayOutcome = "prior_job_completed_before_replay";
}

const status = await waitForCompletion(exportId, authorization);
assert.equal(status.format, "los-apuntes-account-export");
assert.ok([1, 2, 3].includes(status.formatVersion));
assert.equal(status.downloadable, true);
const expiresAt = Date.parse(status.downloadExpiresAt);
assert.ok(Number.isFinite(expiresAt));
assert.ok(
  expiresAt > Date.now(),
  "completed artifact must remain in its availability window",
);
assert.ok(
  expiresAt <= Date.now() + ARTIFACT_TTL_MS,
  "download expiry must be no more than seven days after the current time",
);

const download = await fetch(
  new URL(`/account/exports/${exportId}/download`, baseUrl),
  {
    headers: { authorization },
    signal: AbortSignal.timeout(EXPORT_TIMEOUT_MS),
  },
);
assert.equal(
  download.status,
  200,
  "completed owner export must be downloadable",
);
assert.equal(
  download.headers.get("content-type"),
  "application/json; charset=utf-8",
);
assert.match(
  download.headers.get("content-disposition") ?? "",
  /^attachment;/iu,
);
assert.equal(download.headers.get("cache-control"), "private, no-store");
assert.equal(download.headers.get("x-content-type-options"), "nosniff");
assert.equal(
  download.headers.get("location"),
  null,
  "download must not redirect to storage",
);

const contentLength = Number(download.headers.get("content-length"));
assert.ok(Number.isSafeInteger(contentLength) && contentLength > 0);
assert.ok(contentLength <= MAX_SMOKE_EXPORT_BYTES);
const artifactBytes = await consumeBoundedBody(download, contentLength);
const artifact = JSON.parse(artifactBytes.toString("utf8"));
assert.equal(artifact.format, "los-apuntes-account-export");
assert.equal(artifact.version, status.formatVersion);
const sectionEntries = Object.entries(artifact.sections ?? {});
assert.equal(sectionEntries.length, countFor(status.formatVersion));
assert.equal(Array.isArray(artifact.sections['study.collections']), status.formatVersion >= 2);
assert.equal(Array.isArray(artifact.sections['study.progress']), status.formatVersion >= 3);
for (const [sectionId, records] of sectionEntries) {
  assert.ok(Array.isArray(records), `section ${sectionId} must be an array`);
}
for (const sectionId of [
  "account",
  "profile",
  "academic.affiliations",
  "qa.authoredQuestions",
  "files.uploads",
]) {
  assert.ok(
    Array.isArray(artifact.sections[sectionId]),
    `missing v1 section ${sectionId}`,
  );
}
assertNoCredentialOrStorageFields(artifact);

const recordCount = sectionEntries.reduce(
  (sum, [, records]) => sum + records.length,
  0,
);
assert.ok(Number.isSafeInteger(recordCount) && recordCount >= 0);
console.log(
  JSON.stringify({
    event: "account_export.runtime.smoke.ok",
    state: status.state,
    requestReplayOutcome,
    sectionCount: countFor(status.formatVersion),
    recordCount,
    byteLength: artifactBytes.byteLength,
    downloadable: status.downloadable,
  }),
);
