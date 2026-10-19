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
