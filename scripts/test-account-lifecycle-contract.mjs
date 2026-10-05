import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const [
  controller,
  service,
  worker,
  store,
  docs,
  http,
  profileStore,
  authSmoke,
  exportService,
  exportStore,
  exportSchema,
  exportDocs,
  dataLifecycleModule,
  exportContributors,
  exportRegistry,
  usersService,
  profileService,
] = await Promise.all([
  readFile(new URL('../apps/api/src/data-lifecycle/account-lifecycle.controller.ts', import.meta.url), 'utf8'),
  readFile(new URL('../apps/api/src/data-lifecycle/domain/account-lifecycle.service.ts', import.meta.url), 'utf8'),
  readFile(new URL('../apps/api/src/files/files-cleanup.worker.ts', import.meta.url), 'utf8'),
  readFile(new URL('../apps/api/src/data-lifecycle/mongo/mongo-account-lifecycle.store.ts', import.meta.url), 'utf8'),
  readFile(new URL('../docs/security/account-offboarding-v1.md', import.meta.url), 'utf8'),
  readFile(new URL('../docs/contracts/account-lifecycle-http-v1.md', import.meta.url), 'utf8'),
  readFile(new URL('../apps/api/src/profile/mongo/mongo-profile.store.ts', import.meta.url), 'utf8'),
  readFile(new URL('./smoke-auth-lifecycle.mjs', import.meta.url), 'utf8'),
  readFile(new URL('../apps/api/src/data-lifecycle/domain/account-export.service.ts', import.meta.url), 'utf8'),
  readFile(new URL('../apps/api/src/data-lifecycle/mongo/mongo-account-export.store.ts', import.meta.url), 'utf8'),
  readFile(new URL('../apps/api/src/data-lifecycle/mongo/account-export.mongo-schema.ts', import.meta.url), 'utf8'),
  readFile(new URL('../docs/security/account-data-export-v1.md', import.meta.url), 'utf8'),
  readFile(new URL('../apps/api/src/data-lifecycle/data-lifecycle.module.ts', import.meta.url), 'utf8'),
  readFile(new URL('../apps/api/src/data-lifecycle/contributors/account-export-core.contributors.ts', import.meta.url), 'utf8'),
  readFile(new URL('../apps/api/src/data-lifecycle/domain/account-export-contributor.registry.ts', import.meta.url), 'utf8'),
  readFile(new URL('../apps/api/src/users/users.service.ts', import.meta.url), 'utf8'),
  readFile(new URL('../apps/api/src/profile/domain/profile.service.ts', import.meta.url), 'utf8'),
]);

assert.match(controller, /@Get\('closure\/preflight'\)/u);
assert.match(controller, /@Post\('closure'\)/u);
assert.match(controller, /ACCOUNT_CLOSURE_MANAGEMENT_BLOCKED/u);
assert.match(controller, /ACCOUNT_CLOSURE_REAUTHENTICATION_UNAVAILABLE/u);
assert.match(service, /ACCOUNT_CLOSURE_MANAGER_BLOCKER_LIMIT/u);
assert.match(service, /processPendingCleanup/u);
assert.match(worker, /accounts\.processPendingCleanup/u);
assert.match(worker, /terminalFailuresPresent/u);
assert.match(store, /account_status: 'closed'/u);
assert.match(store, /event: 'account\.closed'/u);
assert.match(store, /lifecycleState: 'closed'/u);
assert.match(profileStore, /account_lifecycle_revision/u);
assert.match(profileStore, /profiles\.create\(\[input\], \{ session \}\)/u);
assert.match(docs, /closure is authority shutdown, not hard deletion or anonymization/iu);
assert.match(docs, /First Profile creation also runs in a transaction/u);
assert.match(http, /HTTP 202/u);
assert.match(
  authSmoke,
  /email:\s*'runtime-smoke-closure@example\.test'/u,
  'destructive closure smoke must use a dedicated account',
);
assert.match(
  authSmoke,
  /assert\.notEqual\(closureCredentials\.email, credentials\.email\)/u,
  'closure fixture must remain distinct from the shared runtime account',
);
assert.match(
  authSmoke,
  /db\.users\.findOne\(\{ email: \$\{JSON\.stringify\(closureCredentials\.email\)\} \}\)/u,
  'closure persistence assertions must target the dedicated account',
);
assert.match(
  authSmoke,
  /const closedLogin = await requestJson\(\s*'\/auth\/mobile\/login',\s*jsonRequest\('POST', closureCredentials\),\s*\);/u,
  'post-closure login proof must target the dedicated account',
);

assert.match(exportService, /ACCOUNT_EXPORT_PAGE_LIMIT/u);
assert.match(exportService, /page\.records\.length > ACCOUNT_EXPORT_PAGE_LIMIT/u);
assert.match(exportStore, /active: true/u);
assert.match(exportStore, /leaseExpiresAt: \{ \$lte: input\.now \}/u);
assert.match(exportStore, /error.*code.*11000/su);
assert.match(exportSchema, /partialFilterExpression: \{ active: true \}/u);
assert.match(exportDocs, /does \*\*not\*\* expose a public request/iu);
assert.match(exportDocs, /los-apuntes-account-export/u);
assert.match(dataLifecycleModule, /AccountExportService/u);
assert.match(dataLifecycleModule, /ACCOUNT_EXPORT_STORE/u);

assert.match(exportContributors, /readonly sectionId = 'account'/u);
assert.match(exportContributors, /readonly sectionId = 'profile'/u);
assert.match(exportContributors, /readonly sectionId = 'profile\.activities'/u);
assert.match(exportContributors, /does not accept a cursor/u);
assert.match(exportRegistry, /Duplicate account export contributor sectionId/u);
assert.match(exportRegistry, /localeCompare/u);
assert.match(usersService, /USER_ACCOUNT_EXPORT_SELECT/u);
assert.match(usersService, /email_verified_at:\s*1/u);
assert.match(usersService, /account_status:\s*1/u);
assert.doesNotMatch(
  usersService.match(/USER_ACCOUNT_EXPORT_SELECT\s*=\s*\{[\s\S]*?\}\s*as const;/u)?.[0] ?? '',
  /(password_hash|credential_version|management_authority_revision|account_lifecycle_revision|platform_permissions)/u,
  'account export select must remain secret/authority-metadata free',
);
assert.match(profileService, /getAccountExportProfile/u);
assert.match(profileService, /listAccountExportActivities/u);
assert.match(dataLifecycleModule, /AccountExportContributorRegistry/u);
assert.match(dataLifecycleModule, /ProfileActivitiesExportContributor/u);
assert.doesNotMatch(
  controller,
  /@(Get|Post)\('(?:data-)?exports?/u,
  'export foundation must not expose incomplete public HTTP behavior',
);

console.log('PASS account lifecycle authority/cleanup contract');
