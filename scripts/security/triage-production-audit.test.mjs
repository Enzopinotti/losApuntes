import assert from 'node:assert/strict';
import test from 'node:test';
import { classifyProductionAudit } from './triage-production-audit.mjs';

const advisory = (module_name, severity, id) => ({
  module_name, severity, url: `https://github.com/advisories/${id}`,
});
const audit = (advisories, high, critical = 0) => ({
  advisories,
  metadata: { vulnerabilities: { info: 0, low: 0, moderate: 3, high, critical } },
});

test('known upstream highs stay HOLD and never certify production', () => {
  const result = classifyProductionAudit(audit({
    1: advisory('node-forge', 'high', 'GHSA-86w9-cpqp-85rv'),
    2: advisory('braces', 'high', 'GHSA-vfj7-8cjw-p6xm'),
  }, 2));
  assert.equal(result.status, 'HOLD');
  assert.deepEqual(result.knownIssueNumbers, [133, 141]);
  assert.deepEqual(result.reasonCodes, ['ACTIVE_HIGH_OR_CRITICAL']);
  assert.equal(result.newHighCount, 0);
  assert.equal(result.productionAuditCertified, false);
});

test('new high and critical findings are additional blockers', () => {
  const result = classifyProductionAudit(audit({
    1: advisory('node-forge', 'high', 'GHSA-86w9-cpqp-85rv'),
    2: advisory('other', 'critical', 'GHSA-xxxx-yyyy-zzzz'),
  }, 1, 1));
  assert.equal(result.status, 'HOLD');
  assert.equal(result.newHighCount, 1);
  assert.deepEqual(result.reasonCodes, ['ACTIVE_HIGH_OR_CRITICAL', 'UNREVIEWED_HIGH_OR_CRITICAL']);
});

test('matching advisory ID does not allow an unexpected package or upgraded severity', () => {
  for (const entry of [
    advisory('node-forge-lookalike', 'high', 'GHSA-86w9-cpqp-85rv'),
    advisory('node-forge', 'critical', 'GHSA-86w9-cpqp-85rv'),
  ]) {
    const critical = entry.severity === 'critical' ? 1 : 0;
    const result = classifyProductionAudit(audit({ 1: entry }, 1 - critical, critical));
    assert.equal(result.status, 'HOLD');
    assert.equal(result.newHighCount, 1);
  }
});

test('missing, invalid, or contradictory JSON always fails closed', () => {
  for (const input of [
    null, {},
    { metadata: { vulnerabilities: {} }, advisories: {} },
    audit({}, 2),
    audit({ 1: { module_name: 'x', severity: 'high' } }, 2),
    { metadata: { vulnerabilities: { info: 0, low: 0, moderate: 0, high: 0, critical: 0 } } },
  ]) {
    const result = classifyProductionAudit(input);
    assert.equal(result.status, 'INVALID_EVIDENCE');
    assert.equal(result.productionAuditCertified, false);
  }
});

test('new npm vulnerability schema remains blocked for known advisory', () => {
  const result = classifyProductionAudit({
    vulnerabilities: {
      braces: { severity: 'high', via: [{ url: 'https://github.com/advisories/GHSA-vfj7-8cjw-p6xm' }] },
    },
    metadata: { vulnerabilities: { info: 0, low: 0, moderate: 0, high: 1, critical: 0 } },
  });
  assert.equal(result.status, 'HOLD');
  assert.deepEqual(result.knownIssueNumbers, [141]);
});

test('zero high still requires separate release qualification', () => {
  const result = classifyProductionAudit(audit({}, 0));
  assert.equal(result.status, 'REVIEW_REQUIRED');
  assert.deepEqual(result.reasonCodes, []);
  assert.equal(result.productionAuditCertified, false);
});

const npmAudit = (name, via, severity = 'high') => ({
  vulnerabilities: { [name]: { severity, via } },
  metadata: { vulnerabilities: {
    info: 0, low: 0, moderate: 0,
    high: severity === 'high' ? 1 : 0,
    critical: severity === 'critical' ? 1 : 0,
  } },
});

test('B141 npm high package with known AND new high via retains both signals', () => {
  const result = classifyProductionAudit(npmAudit('node-forge', [
    { id: 'GHSA-86w9-cpqp-85rv', severity: 'high',
      url: 'https://github.com/advisories/GHSA-86w9-cpqp-85rv' },
    { id: 'GHSA-aaaa-bbbb-cccc', severity: 'high',
      url: 'https://github.com/advisories/GHSA-aaaa-bbbb-cccc' },
  ]));
  assert.equal(result.status, 'HOLD');
  assert.equal(result.highCount, 1, 'npm counts vulnerable packages, not via items');
  assert.deepEqual(result.knownIssueNumbers, [133]);
  assert.equal(result.newHighCount, 1);
  assert.deepEqual(result.reasonCodes, ['ACTIVE_HIGH_OR_CRITICAL', 'UNREVIEWED_HIGH_OR_CRITICAL']);
  assert.equal(result.productionAuditCertified, false);
});

test('B141 npm moderate via before known high must not hide correct issue', () => {
  const result = classifyProductionAudit(npmAudit('braces', [
    { id: 'GHSA-mmmm-nnnn-oooo', severity: 'moderate',
      url: 'https://github.com/advisories/GHSA-mmmm-nnnn-oooo' },
    { id: 'GHSA-vfj7-8cjw-p6xm', severity: 'high',
      url: 'https://github.com/advisories/GHSA-vfj7-8cjw-p6xm' },
  ]));
  assert.equal(result.status, 'HOLD');
  assert.deepEqual(result.knownIssueNumbers, [141]);
  assert.equal(result.newHighCount, 0);
  assert.deepEqual(result.reasonCodes, ['ACTIVE_HIGH_OR_CRITICAL']);
});

test('B141 ambiguous and mismatched advisory identities are never accepted as known-only', () => {
  for (const via of [
    [{ id: 'GHSA-86w9-cpqp-85rv', severity: 'high',
      url: 'https://github.com/advisories/GHSA-aaaa-bbbb-cccc' }],
    [{ id: 'GHSA-86w9-cpqp-85rv', severity: 'high',
      url: 'https://github.com/advisories/GHSA-86w9-cpqp-85rv GHSA-aaaa-bbbb-cccc' }],
    ['transitive-only-high-without-advisory-identity'],
    [{ severity: 'high', url: 'https://example.invalid/no-ghsa' }],
    [],
  ]) {
    const result = classifyProductionAudit(npmAudit('node-forge', via));
    assert.equal(result.status, 'HOLD');
    assert.equal(result.newHighCount, 1);
    assert.equal(result.productionAuditCertified, false);
  }
});

test('B141 legacy advisory metadata cannot substitute mismatched IDs', () => {
  const result = classifyProductionAudit(audit({
    1: { ...advisory('node-forge', 'high', 'GHSA-86w9-cpqp-85rv'),
      id: 'GHSA-aaaa-bbbb-cccc' },
  }, 1));
  assert.equal(result.status, 'HOLD');
  assert.deepEqual(result.knownIssueNumbers, []);
  assert.equal(result.newHighCount, 1);
});

test('B141 root critical always remains unreviewed even if its via resembles an old high', () => {
  const result = classifyProductionAudit(npmAudit('node-forge', [
    { id: 'GHSA-86w9-cpqp-85rv', severity: 'critical',
      url: 'https://github.com/advisories/GHSA-86w9-cpqp-85rv' },
  ], 'critical'));
  assert.equal(result.status, 'HOLD');
  assert.equal(result.criticalCount, 1);
  assert.equal(result.newHighCount, 1);
  assert.deepEqual(result.knownIssueNumbers, []);
});
