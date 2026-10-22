import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

// Diagnostic classification, not an audit exception or a release authorization.
const KNOWN_ADVISORIES = Object.freeze({
  'GHSA-86w9-cpqp-85rv': { packageName: 'node-forge', issue: 133 },
  'GHSA-vfj7-8cjw-p6xm': { packageName: 'braces', issue: 141 },
});
const ADVISORY_ID = /GHSA-[\w-]{4,}/u;
const SEVERITIES = new Set(['info', 'low', 'moderate', 'high', 'critical']);

function object(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function advisoryEntries(document) {
  if (object(document.advisories)) return Object.entries(document.advisories);
  // Accept the newer npm shape; absence of both formats is invalid, never clean.
  if (object(document.vulnerabilities)) {
    return Object.entries(document.vulnerabilities).map(([name, detail]) => {
      const via = Array.isArray(detail?.via)
        ? detail.via.find((entry) => object(entry) && typeof entry.url === 'string')
        : null;
      return [name, { module_name: name, severity: detail?.severity, url: via?.url }];
    });
  }
  return null;
}

function identifyAdvisory(key, value) {
  const tokens = [key, value.id, value.url, ...(Array.isArray(value.cves) ? value.cves : [])];
  for (const token of tokens) {
    if (typeof token !== 'string' && typeof token !== 'number') continue;
    const match = String(token).match(ADVISORY_ID);
    if (match) return match[0];
  }
  return null;
}

/**
 * Never certifies a release. A structurally sound audit with no high findings
 * still requires independent exact-head, runtime and security evidence.
 */
export function classifyProductionAudit(document) {
  const errors = new Set();
  const blockers = new Set();
  if (!object(document) || !object(document.metadata?.vulnerabilities)) {
    return {
      event: 'security.production_audit.triage', status: 'INVALID_EVIDENCE',
      highCount: null, criticalCount: null, knownIssueNumbers: [],
      newHighCount: null, reasonCodes: ['AUDIT_JSON_INVALID'],
      productionAuditCertified: false,
    };
  }
  const counts = document.metadata.vulnerabilities;
  for (const name of ['info', 'low', 'moderate', 'high', 'critical']) {
    if (!Number.isSafeInteger(counts[name]) || counts[name] < 0) errors.add('AUDIT_COUNTS_INVALID');
  }
  const entries = advisoryEntries(document);
  if (!entries) errors.add('AUDIT_ADVISORIES_MISSING');
  if (entries && entries.length > 10000) errors.add('AUDIT_ADVISORIES_OVERSIZED');

  let observedHigh = 0;
  let observedCritical = 0;
  let newHigh = 0;
  const issues = new Set();
  for (const [key, value] of (entries ?? []).slice(0, 10000)) {
    if (!object(value) || !SEVERITIES.has(value.severity) || typeof value.module_name !== 'string' || !value.module_name) {
      errors.add('AUDIT_ADVISORY_INVALID');
      continue;
    }
    if (value.severity !== 'high' && value.severity !== 'critical') continue;
    if (value.severity === 'high') observedHigh++;
    else observedCritical++;
    const advisoryId = identifyAdvisory(key, value);
    const known = advisoryId && KNOWN_ADVISORIES[advisoryId];
    if (known && value.module_name === known.packageName && value.severity === 'high') {
      issues.add(known.issue);
    } else {
      newHigh++;
    }
  }
  if (Number.isSafeInteger(counts.high) && counts.high !== observedHigh) errors.add('AUDIT_HIGH_COUNT_MISMATCH');
  if (Number.isSafeInteger(counts.critical) && counts.critical !== observedCritical) errors.add('AUDIT_CRITICAL_COUNT_MISMATCH');
  if (observedHigh + observedCritical > 0 || counts.high > 0 || counts.critical > 0) {
    blockers.add('ACTIVE_HIGH_OR_CRITICAL');
  }
  if (newHigh > 0) blockers.add('UNREVIEWED_HIGH_OR_CRITICAL');
  const status = errors.size ? 'INVALID_EVIDENCE' : blockers.size ? 'HOLD' : 'REVIEW_REQUIRED';
  return {
    event: 'security.production_audit.triage', status,
    highCount: counts.high ?? null, criticalCount: counts.critical ?? null,
    knownIssueNumbers: [...issues].sort((a, b) => a - b), newHighCount: newHigh,
    reasonCodes: [...new Set([...errors, ...blockers])].sort(),
    productionAuditCertified: false,
  };
}

async function main() {
  if (process.argv.length !== 3) {
    console.error('usage: node scripts/security/triage-production-audit.mjs <pnpm-audit-json-file>');
    process.exitCode = 2;
    return;
  }
  try {
    const input = await readFile(process.argv[2], 'utf8');
    const result = classifyProductionAudit(JSON.parse(input));
    console.log(JSON.stringify(result));
    if (result.status !== 'REVIEW_REQUIRED') process.exitCode = 1;
  } catch {
    console.log(JSON.stringify({
      event: 'security.production_audit.triage', status: 'INVALID_EVIDENCE',
      productionAuditCertified: false, reasonCodes: ['AUDIT_JSON_UNREADABLE'],
    }));
    process.exitCode = 1;
  }
}

if (process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url) {
  await main();
}
