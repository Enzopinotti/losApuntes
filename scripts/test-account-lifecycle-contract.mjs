import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const [controller, service, worker, store, docs, http] = await Promise.all([
  readFile(new URL('../apps/api/src/data-lifecycle/account-lifecycle.controller.ts', import.meta.url), 'utf8'),
  readFile(new URL('../apps/api/src/data-lifecycle/domain/account-lifecycle.service.ts', import.meta.url), 'utf8'),
  readFile(new URL('../apps/api/src/files/files-cleanup.worker.ts', import.meta.url), 'utf8'),
  readFile(new URL('../apps/api/src/data-lifecycle/mongo/mongo-account-lifecycle.store.ts', import.meta.url), 'utf8'),
  readFile(new URL('../docs/security/account-offboarding-v1.md', import.meta.url), 'utf8'),
  readFile(new URL('../docs/contracts/account-lifecycle-http-v1.md', import.meta.url), 'utf8'),
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
assert.match(docs, /closure is authority shutdown, not hard deletion or anonymization/iu);
assert.match(http, /HTTP 202/u);

console.log('PASS account lifecycle authority/cleanup contract');
