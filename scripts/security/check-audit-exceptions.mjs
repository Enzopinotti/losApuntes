import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const [policyText, rootText, lock, apiText, webText, mobileText] =
  await Promise.all([
    readFile(
      new URL('../../security/audit-exceptions.json', import.meta.url),
      'utf8',
    ),
    readFile(new URL('../../package.json', import.meta.url), 'utf8'),
    readFile(new URL('../../pnpm-lock.yaml', import.meta.url), 'utf8'),
    readFile(new URL('../../apps/api/package.json', import.meta.url), 'utf8'),
    readFile(new URL('../../apps/web/package.json', import.meta.url), 'utf8'),
    readFile(new URL('../../apps/mobile/package.json', import.meta.url), 'utf8'),
  ]);

const policy = JSON.parse(policyText);
const root = JSON.parse(rootText);
const api = JSON.parse(apiText);
const web = JSON.parse(webText);
const mobile = JSON.parse(mobileText);

assert.equal(policy.version, 1);
assert.equal(policy.exceptions.length, 1);

const exception = policy.exceptions[0];
assert.deepEqual(
  {
    cve: exception.cve,
    ghsa: exception.ghsa,
    package: exception.package,
    version: exception.version,
    trackingIssue: exception.trackingIssue,
  },
  {
    cve: 'CVE-2026-85393',
    ghsa: 'GHSA-86w9-cpqp-85rv',
    package: 'node-forge',
    version: '1.4.0',
    trackingIssue: 'https://github.com/Enzopinotti/losApuntes/issues/133',
  },
);

const expiresAt = Date.parse(exception.expiresAt);
assert.equal(Number.isFinite(expiresAt), true);
assert.ok(
  Date.now() < expiresAt,
  `audit exception expired at ${exception.expiresAt}; re-evaluate upstream before CI may pass`,
);

assert.deepEqual(
  root.pnpm?.auditConfig?.ignoreCves,
  [exception.cve],
  'pnpm audit exception list must match governed policy exactly',
);

function directDependencyNames(manifest) {
  return new Set([
    ...Object.keys(manifest.dependencies ?? {}),
    ...Object.keys(manifest.devDependencies ?? {}),
    ...Object.keys(manifest.optionalDependencies ?? {}),
    ...Object.keys(manifest.peerDependencies ?? {}),
  ]);
}

for (const [surface, manifest] of [
  ['api', api],
  ['web', web],
]) {
  assert.equal(
    directDependencyNames(manifest).has(exception.package),
    false,
    `${exception.package} must not become a direct ${surface} dependency`,
  );
}

assert.equal(
  directDependencyNames(mobile).has(exception.package),
  false,
  `${exception.package} must remain transitive in Mobile`,
);
assert.equal(
  directDependencyNames(mobile).has('@expo/code-signing-certificates'),
  false,
  '@expo/code-signing-certificates must remain transitive rather than app-owned',
);

const packageVersions = new Set();
for (const line of lock.split('\n')) {
  const match = line.match(/^  node-forge@([^:]+):/u);
  if (match) packageVersions.add(match[1]);
}
assert.deepEqual(
  [...packageVersions],
  [exception.version],
  'the exception is valid only for the reviewed node-forge version',
);

const snapshotsIndex = lock.indexOf('\nsnapshots:\n');
assert.notEqual(snapshotsIndex, -1, 'pnpm lockfile snapshots section is required');

const snapshotLines = lock.slice(snapshotsIndex + 1).split('\n');
let currentSnapshot = null;
const parents = [];

for (const line of snapshotLines) {
  const snapshot = line.match(/^  (\S.*):$/u);
  if (snapshot) {
    currentSnapshot = snapshot[1];
    continue;
  }

  if (
    currentSnapshot &&
    line.trim() === `${exception.package}: ${exception.version}`
  ) {
    parents.push(currentSnapshot);
  }
}

const allowedPrefixes = exception.allowedSnapshotParentPrefixes;
assert.equal(Array.isArray(allowedPrefixes), true);
assert.equal(allowedPrefixes.length, 2);
assert.equal(parents.length, 2, 'reviewed node-forge parent count changed');

for (const parentName of parents) {
  assert.ok(
    allowedPrefixes.some((prefix) => parentName.startsWith(prefix)),
    `unreviewed node-forge dependency parent detected: ${parentName}`,
  );
}
for (const prefix of allowedPrefixes) {
  assert.ok(
    parents.some((parentName) => parentName.startsWith(prefix)),
    `expected reviewed dependency parent missing: ${prefix}`,
  );
}

const packagesIndex = lock.indexOf('\npackages:\n');
assert.notEqual(packagesIndex, -1, 'pnpm lockfile packages section is required');
const importersText = lock.slice(0, packagesIndex);
assert.equal(
  importersText.includes('node-forge:'),
  false,
  'node-forge must not become a direct workspace importer dependency',
);

console.log(
  JSON.stringify({
    event: 'security.audit_exception.valid',
    cve: exception.cve,
    ghsa: exception.ghsa,
    package: exception.package,
    version: exception.version,
    expiresAt: exception.expiresAt,
    reviewedParents: parents,
  }),
);
