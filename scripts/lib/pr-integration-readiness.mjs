// Read-only preflight. This module never grants merge or release authority.
export const REQUIRED_CHECKS = Object.freeze([
  'Quality Gate',
  'Production dependency audit',
  'Container runtime smoke',
  'Auth critical coverage',
  'Academic critical coverage',
  'Profile critical coverage',
  'Files Resources critical coverage',
  'Search critical coverage',
  'Social Q&A critical coverage',
  'Feeds critical coverage',
  'Pilot critical coverage',
  'Organizations critical coverage',
  'Alumni critical coverage',
]);

const shaPattern = /^[0-9a-f]{40}$/i;

export function assessIntegrationReadiness({ pull, baseSha, checks, baseBranch = 'main' }) {
  const reasons = [];
  const checkDetails = [];
  if (!pull || typeof pull !== 'object') {
    return { status: 'HOLD', reasons: ['INVALID_PULL_DATA'], checks: [] };
  }
  const headSha = pull.head?.sha;
  if (typeof headSha !== 'string' || !shaPattern.test(headSha)) reasons.push('INVALID_HEAD_SHA');
  if (typeof baseSha !== 'string' || !shaPattern.test(baseSha)) reasons.push('INVALID_BASE_SHA');
  if (pull.state !== 'open') reasons.push('PULL_NOT_OPEN');
  if (pull.draft !== false) reasons.push('DRAFT_OR_UNKNOWN');
  if (pull.base?.ref !== baseBranch) reasons.push('WRONG_BASE_BRANCH');
  if (pull.base?.sha !== baseSha) reasons.push('STALE_BASE_SHA');
  if (pull.mergeable !== true || pull.mergeable_state !== 'clean') reasons.push('MERGEABILITY_NOT_CLEAN');
  if (!Array.isArray(checks)) {
    reasons.push('INVALID_CHECK_DATA');
  }
  for (const name of REQUIRED_CHECKS) {
    const candidates = Array.isArray(checks)
      ? checks.filter((check) => check?.name === name && check?.head_sha === headSha)
      : [];
    // Old-head green results are never evidence for this exact candidate.
    // Conflicting attempts require inspection, not optimistic auto-selection.
    let state = 'MISSING';
    if (candidates.length > 0) {
      state = candidates.every((check) => check.status === 'completed' && check.conclusion === 'success')
        ? 'PASS'
        : 'UNVERIFIED';
    }
    if (state !== 'PASS') reasons.push(`CHECK_${state}:${name}`);
    checkDetails.push({ name, state });
  }
  return {
    status: reasons.length === 0 ? 'CANDIDATE_FOR_HUMAN_REVIEW' : 'HOLD',
    headSha: shaPattern.test(headSha || '') ? headSha : null,
    baseSha: shaPattern.test(baseSha || '') ? baseSha : null,
    reasons,
    checks: checkDetails,
    releaseAuthorized: false,
    automaticMergeAuthorized: false,
  };
}
