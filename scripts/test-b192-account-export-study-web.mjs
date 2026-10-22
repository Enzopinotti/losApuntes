import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import {
  AccountExportContractError,
  parseAccountExportRequest,
  parseAccountExportStatus,
} from "../apps/web/src/features/account-export/accountExportContract.ts";

const read = (path) =>
  readFile(new URL("../" + path, import.meta.url), "utf8");

const status = {
  id: "123e4567-e89b-42d3-a456-426614174000",
  format: "los-apuntes-account-export",
  formatVersion: 3,
  state: "completed",
  requestedAt: "2026-10-22T11:00:00.000Z",
  failureCode: null,
  downloadExpiresAt: "2026-10-29T11:00:00.000Z",
  downloadable: true,
};

for (const version of [1, 2, 3]) {
  assert.deepEqual(
    parseAccountExportStatus({ ...status, formatVersion: version }),
    { ...status, formatVersion: version },
    "all historical account export status versions must remain supported",
  );
}
assert.deepEqual(parseAccountExportRequest({ created: true, export: status }), {
  created: true,
  export: status,
});
for (const mutation of [
  { formatVersion: 4 },
  { formatVersion: "3" },
  { format: "study.progress" },
  { downloadable: "true" },
  { state: "processing", downloadable: true },
  { downloadExpiresAt: null },
]) {
  assert.throws(
    () => parseAccountExportStatus({ ...status, ...mutation }),
    AccountExportContractError,
    "malformed or forged v3 download state cannot be presented",
  );
}

const [panel, api, security, flags, registry, contributor, reader, service] =
  await Promise.all([
    read("apps/web/src/features/account-export/AccountExportPanel.tsx"),
    read("apps/web/src/features/account-export/accountExportService.ts"),
    read("apps/web/src/pages/Security.tsx"),
    read("apps/web/.env.example"),
    read("apps/api/src/data-lifecycle/domain/account-export-contributor.registry.ts"),
    read("apps/api/src/data-lifecycle/contributors/account-export-study-progress.contributor.ts"),
    read("apps/api/src/study-progress/mongo/study-progress-export.reader.ts"),
    read("apps/api/src/study-progress/study-progress.service.ts"),
  ]);

assert.match(panel, /job\?\.formatVersion === 3/u);
assert.match(panel, /job\.state === "completed"/u);
assert.match(panel, /job\.downloadable/u);
assert.match(panel, /Esta copia incluye el progreso de estudio guardado/u);
assert.match(panel, /No\s+incorpora materiales de otras personas ni otorga permisos/u);
assert.doesNotMatch(panel, /\.blob\(|\.arrayBuffer\(|createObjectURL|localStorage|sessionStorage/u);
assert.match(panel, /useAsyncAuthorityFence/u);
assert.match(panel, /session\?\.id/u);
assert.match(panel, /referrerPolicy="no-referrer"/u);

assert.match(api, /authenticatedJsonRequest/u);
assert.match(api, /authenticatedApiUrl/u);
assert.match(api, /encodeURIComponent\(id\)/u);
assert.match(api, /\/account\/exports/u);
assert.doesNotMatch(api, /\.blob\(|\.arrayBuffer\(|createObjectURL|localStorage|sessionStorage/u);
assert.match(security, /VITE_ACCOUNT_EXPORT_WEB_ENABLED === "true"/u);
assert.match(flags, /VITE_ACCOUNT_EXPORT_WEB_ENABLED=false/u);

assert.match(registry, /ACCOUNT_EXPORT_V3_SECTION_IDS/u);
assert.match(registry, /\.\.\.ACCOUNT_EXPORT_V2_SECTION_IDS, 'study\.progress'/u);
assert.match(registry, /version === 1/u);
assert.match(registry, /version === 2/u);
assert.match(registry, /version === 3/u);
assert.match(contributor, /sectionId = 'study\.progress'/u);
assert.match(contributor, /listAccountExportProgress\(input\.userId/u);
assert.match(contributor, /tasks: row\.plan\.tasks\.map/u);
assert.doesNotMatch(contributor, /signedUrl|accessToken|authorizationToken/u);
assert.match(reader, /ownerUserId,/u);
assert.match(reader, /parseStudyProgressPlan\(row\.plan, row\.subjectId\)/u);
assert.match(reader, /STUDY_PROGRESS_EXPORT_PAGE_LIMIT = 100/u);
assert.match(service, /STUDY_PROGRESS_STORED_INVALID/u);

console.log("PASS B192 v1-v3 Web account export + owner-only study progress bridge");
