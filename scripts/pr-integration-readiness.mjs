#!/usr/bin/env node
/**
 * Read-only integration preflight for one PR.
 * It reports HOLD or CANDIDATE_FOR_HUMAN_REVIEW; it never merges, approves, or releases.
 * Usage: GITHUB_TOKEN=... node scripts/pr-integration-readiness.mjs OWNER/REPO PR_NUMBER
 */
import { assessIntegrationReadiness } from './lib/pr-integration-readiness.mjs';

const [repo, rawNumber] = process.argv.slice(2);
const token = process.env.GITHUB_TOKEN;
const invalidInput = !/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repo || '') ||
  !/^[1-9]\d{0,8}$/.test(rawNumber || '');
if (invalidInput || !token) {
  console.error('Usage: GITHUB_TOKEN=<read-only token> node scripts/pr-integration-readiness.mjs OWNER/REPO PR_NUMBER');
  process.exitCode = 2;
} else {
  const root = `https://api.github.com/repos/${repo}`;
  const request = async (path) => {
    const response = await fetch(`${root}${path}`, {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
      },
      signal: AbortSignal.timeout(15000),
    });
    if (!response.ok) throw new Error(`GitHub request failed: HTTP ${response.status}`);
    return response.json();
  };
  try {
    const [pull, startMain] = await Promise.all([
      request(`/pulls/${rawNumber}`),
      request('/git/ref/heads/main'),
    ]);
    const headSha = pull?.head?.sha;
    if (!/^[0-9a-f]{40}$/i.test(headSha || '')) throw new Error('Missing valid PR HEAD');
    const checkResponse = await request(`/commits/${headSha}/check-runs?per_page=100&filter=latest`);
    if (!Array.isArray(checkResponse.check_runs) || checkResponse.total_count > 100) {
      throw new Error('Incomplete check-run inventory');
    }
    // Prevent TOCTOU acceptance if main or the PR moved during the query.
    const [endPull, endMain] = await Promise.all([
      request(`/pulls/${rawNumber}`),
      request('/git/ref/heads/main'),
    ]);
    if (endPull?.head?.sha !== headSha || endMain?.object?.sha !== startMain?.object?.sha) {
      throw new Error('HEAD or main moved during inspection');
    }
    const report = assessIntegrationReadiness({
      pull: endPull, baseSha: endMain?.object?.sha, checks: checkResponse.check_runs,
    });
    console.log(JSON.stringify({ repo, pullNumber: Number(rawNumber), ...report }, null, 2));
    if (report.status !== 'CANDIDATE_FOR_HUMAN_REVIEW') process.exitCode = 1;
  } catch (error) {
    // Errors intentionally exclude URL, authorization headers and GitHub's returned payloads.
    console.log(JSON.stringify({
      repo, pullNumber: Number(rawNumber), status: 'HOLD',
      reasons: ['INCOMPLETE_OR_CHANGED_REMOTE_EVIDENCE'],
      releaseAuthorized: false, automaticMergeAuthorized: false,
    }, null, 2));
    console.error(error instanceof Error ? error.message : 'Remote verification failed');
    process.exitCode = 1;
  }
}
