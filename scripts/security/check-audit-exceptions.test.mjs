import assert from 'node:assert/strict';
import test from 'node:test';

import { validateNoAuditExceptions } from './check-audit-exceptions.mjs';

const permitted = { version: 1, exceptions: [] };
const manifest = { name: 'los-apuntes', pnpm: { overrides: {} } };

test('clean policy reports zero waivers, without certifying the production audit', () => {
  assert.deepEqual(validateNoAuditExceptions(permitted, manifest), {
    event: 'security.audit_exceptions.none',
    exceptionCount: 0,
    ignoredAdvisoryCount: 0,
    productionAuditCertified: false,
  });
});

test('rejects the expired node-forge exception, including if its expiry is extended', () => {
  for (const expiresAt of ['2026-10-15T00:00:00.000Z', '2027-10-15T00:00:00.000Z']) {
    assert.throws(
      () => validateNoAuditExceptions({
        version: 1,
        exceptions: [{ cve: 'CVE-2026-85393', expiresAt }],
      }, manifest),
      /audit exceptions are not authorized/u,
    );
  }
});

test('rejects blanket or targeted pnpm audit ignore settings', () => {
  for (const auditConfig of [
    { ignoreCves: ['CVE-2026-85393'] },
    { ignoreCves: ['CVE-2026-93687'] },
    { ignoreGhsas: ['GHSA-86w9-cpqp-85rv'] },
    {},
  ]) {
    assert.throws(
      () => validateNoAuditExceptions(permitted, {
        ...manifest,
        pnpm: { overrides: {}, auditConfig },
      }),
      /pnpm auditConfig is forbidden/u,
    );
  }
});

test('rejects malformed policy, missing pnpm, unknown policy keys and invalid version', () => {
  for (const policy of [
    null,
    [],
    { version: 2, exceptions: [] },
    { version: 1 },
    { version: 1, exceptions: [], ignoredAdvisories: [] },
  ]) {
    assert.throws(() => validateNoAuditExceptions(policy, manifest));
  }
  assert.throws(() => validateNoAuditExceptions(permitted, { pnpm: null }));
});
