import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  AccountExportContractError,
  parseAccountExportRequest,
  parseAccountExportStatus,
} from "../apps/web/src/features/account-export/accountExportContract.ts";
import {
  accountExportExpiryDelayMs,
  accountExportStatusMessage,
  isAccountExportDownloadAvailable,
} from "../apps/web/src/features/account-export/accountExportPresentation.ts";

const valid = {
  id: "123e4567-e89b-42d3-a456-426614174000",
  format: "los-apuntes-account-export",
  formatVersion: 1,
  state: "completed",
  requestedAt: "2026-10-11T12:00:00.000Z",
  failureCode: null,
  downloadExpiresAt: "2026-10-18T12:00:00.000Z",
  downloadable: true,
};

assert.deepEqual(parseAccountExportStatus(valid), valid);
const now = Date.parse("2026-10-15T12:00:00.000Z");
assert.equal(isAccountExportDownloadAvailable(valid, now), true);
assert.equal(
  accountExportStatusMessage(valid, now),
  "El archivo está disponible para descargar.",
);
assert.equal(
  isAccountExportDownloadAvailable(valid, Date.parse(valid.downloadExpiresAt)),
  false,
);
assert.equal(
  accountExportStatusMessage(valid, Date.parse(valid.downloadExpiresAt)),
  "Este archivo ya no está disponible. Podés solicitar otro.",
);
assert.equal(
  accountExportExpiryDelayMs(
    "2026-10-15T12:10:00.000Z",
    Date.parse("2026-10-15T12:05:00.000Z"),
  ),
  5 * 60 * 1000,
);
assert.equal(
  accountExportExpiryDelayMs(
    "2026-10-15T12:05:00.000Z",
    Date.parse("2026-10-15T12:05:00.000Z"),
  ),
  0,
);
assert.equal(
  isAccountExportDownloadAvailable({ ...valid, downloadable: false }, now),
  false,
);
for (const formatVersion of [1, 2, 3]) {
  assert.equal(
    parseAccountExportStatus({ ...valid, formatVersion }).formatVersion,
    formatVersion,
  );
}
assert.deepEqual(parseAccountExportRequest({ created: false, export: valid }), {
  created: false,
  export: valid,
});

for (const [field, value] of [
  ["id", "../foreign"],
  ["format", "other"],
  ["formatVersion", 4],
  ["state", "unknown"],
  ["requestedAt", "not-a-date"],
  ["downloadExpiresAt", "bad-date"],
  ["failureCode", "SECRET_LEAK"],
  ["downloadable", "true"],
]) {
  assert.throws(
    () => parseAccountExportStatus({ ...valid, [field]: value }),
    AccountExportContractError,
    `Invalid field ${field} must fail closed`,
  );
}
assert.throws(
  () => parseAccountExportStatus({ ...valid, state: "pending" }),
  AccountExportContractError,
);
assert.throws(
  () => parseAccountExportRequest({ created: "false", export: valid }),
  AccountExportContractError,
);
assert.deepEqual(
  parseAccountExportStatus({
    ...valid,
    state: "failed",
    failureCode: "EXPORT_RETRY_EXHAUSTED",
    downloadExpiresAt: null,
    downloadable: false,
  }).state,
  "failed",
);

const read = async (path) =>
  readFile(new URL(`../${path}`, import.meta.url), "utf8");
const api = await read(
  "apps/web/src/features/account-export/accountExportService.ts",
);
const panel = await read(
  "apps/web/src/features/account-export/AccountExportPanel.tsx",
);
const presentation = await read(
  "apps/web/src/features/account-export/accountExportPresentation.ts",
);
const security = await read("apps/web/src/pages/Security.tsx");
const authService = await read(
  "apps/web/src/features/auth/services/authService.ts",
);
const env = await read("apps/web/.env.example");

assert.match(api, /authenticatedJsonRequest/u);
assert.match(api, /authenticatedApiUrl/u);
assert.match(api, /method: "POST"/u);
assert.match(api, /\/account\/exports/u);
assert.match(api, /encodeURIComponent\(id\)/u);
assert.doesNotMatch(
  api,
  /\.blob\(|\.arrayBuffer\(|URL\.createObjectURL|localStorage|sessionStorage/u,
);
assert.match(authService, /credentials: "include"/u);
assert.match(authService, /cache: "no-store"/u);
assert.match(panel, /useAsyncAuthorityFence/u);
assert.match(panel, /session\?\.id/u);
assert.match(panel, /document\.visibilityState/u);
assert.match(panel, /visibilitychange/u);
assert.match(panel, /setTimeout\(/u);
assert.match(panel, /setNow\(currentTime\)/u);
assert.match(panel, /accountExportExpiryDelayMs\(/u);
assert.match(panel, /const currentTime = Date\.now\(\)/u);
assert.match(panel, /accountExportStatusMessage\(job, now\)/u);
assert.match(panel, /isAccountExportDownloadAvailable\(job, now\)/u);
assert.match(panel, /referrerPolicy="no-referrer"/u);
assert.match(presentation, /Date\.parse\(value\.downloadExpiresAt\) > now/u);
assert.match(panel, /target="_blank"/u);
assert.doesNotMatch(
  panel,
  /localStorage|sessionStorage|\.blob\(|\.arrayBuffer\(|createObjectURL/u,
);
assert.match(security, /VITE_ACCOUNT_EXPORT_WEB_ENABLED === "true"/u);
assert.match(security, /<AccountExportPanel \/>/u);
assert.match(env, /VITE_ACCOUNT_EXPORT_WEB_ENABLED=false/u);

console.log("PASS Web Account Export security and response contract");
