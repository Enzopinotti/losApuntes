import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

/**
 * Validate audit policy independently of the vulnerability scanner.
 * This only proves that no advisory is hidden by pnpm's ignore policy;
 * pnpm audit:prod remains an independent, mandatory and potentially red gate.
 */
export function validateNoAuditExceptions(policy, root) {
  assert.ok(policy !== null && typeof policy === 'object' && !Array.isArray(policy));
  assert.deepEqual(Object.keys(policy).sort(), ['exceptions', 'version']);
  assert.equal(policy.version, 1, 'unsupported audit-exception policy version');
  assert.deepEqual(policy.exceptions, [], 'audit exceptions are not authorized');
  assert.ok(root !== null && typeof root === 'object' && !Array.isArray(root));
  assert.ok(root.pnpm !== null && typeof root.pnpm === 'object' && !Array.isArray(root.pnpm));
  assert.equal(
    Object.hasOwn(root.pnpm, 'auditConfig'),
    false,
    'pnpm auditConfig is forbidden; all advisories must be visible',
  );

  return {
    event: 'security.audit_exceptions.none',
    exceptionCount: 0,
    ignoredAdvisoryCount: 0,
    productionAuditCertified: false,
  };
}

async function main() {
  const [policyText, packageText] = await Promise.all([
    readFile(new URL('../../security/audit-exceptions.json', import.meta.url), 'utf8'),
    readFile(new URL('../../package.json', import.meta.url), 'utf8'),
  ]);
  const result = validateNoAuditExceptions(JSON.parse(policyText), JSON.parse(packageText));
  console.log(JSON.stringify(result));
}

if (
  process.argv[1] &&
  pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url
) {
  await main();
}
