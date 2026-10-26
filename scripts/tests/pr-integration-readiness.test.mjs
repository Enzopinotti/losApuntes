import assert from 'node:assert/strict';
import test from 'node:test';
import { REQUIRED_CHECKS, assessIntegrationReadiness } from '../lib/pr-integration-readiness.mjs';

const HEAD = 'a'.repeat(40);
const BASE = 'b'.repeat(40);
const makePull = () => ({
  state: 'open', draft: false, mergeable: true, mergeable_state: 'clean',
  head: { sha: HEAD }, base: { ref: 'main', sha: BASE },
});
const checks = () => REQUIRED_CHECKS.map((name) => ({
  name, head_sha: HEAD, status: 'completed', conclusion: 'success',
}));
const evaluate = (overrides = {}) => assessIntegrationReadiness({
  pull: makePull(), baseSha: BASE, checks: checks(), ...overrides,
});

test('all exact-head required checks produce candidate, never permission', () => {
  const result = evaluate();
  assert.equal(result.status, 'CANDIDATE_FOR_HUMAN_REVIEW');
  assert.equal(result.releaseAuthorized, false);
  assert.equal(result.automaticMergeAuthorized, false);
  assert.equal(result.checks.length, REQUIRED_CHECKS.length);
});
test('missing audit fails closed', () => {
  const result = evaluate({ checks: checks().filter((x) => x.name !== 'Production dependency audit') });
  assert.equal(result.status, 'HOLD');
  assert.ok(result.reasons.includes('CHECK_MISSING:Production dependency audit'));
});
test('HIGH audit failure fails closed even if every other gate passes', () => {
  const result = evaluate({ checks: checks().map((x) => x.name === 'Production dependency audit'
    ? { ...x, conclusion: 'failure' } : x) });
  assert.ok(result.reasons.includes('CHECK_UNVERIFIED:Production dependency audit'));
});
test('old-head checks never certify a new candidate', () => {
  const result = evaluate({ checks: checks().map((x) => ({ ...x, head_sha: 'c'.repeat(40) })) });
  assert.equal(result.status, 'HOLD');
  assert.equal(result.checks.filter((x) => x.state === 'MISSING').length, REQUIRED_CHECKS.length);
});
test('draft is blocked', () => {
  assert.ok(evaluate({ pull: { ...makePull(), draft: true } }).reasons.includes('DRAFT_OR_UNKNOWN'));
});
test('unknown mergeability fails closed', () => {
  assert.ok(evaluate({ pull: { ...makePull(), mergeable: null } }).reasons.includes('MERGEABILITY_NOT_CLEAN'));
});
test('merge conflicts fail closed', () => {
  assert.ok(evaluate({ pull: { ...makePull(), mergeable_state: 'dirty' } }).reasons.includes('MERGEABILITY_NOT_CLEAN'));
});
test('base moves after green checks and candidate becomes stale', () => {
  assert.ok(evaluate({ baseSha: 'd'.repeat(40) }).reasons.includes('STALE_BASE_SHA'));
});
test('different target branch is blocked', () => {
  assert.ok(evaluate({ pull: { ...makePull(), base: { ref: 'staging', sha: BASE } } }).reasons.includes('WRONG_BASE_BRANCH'));
});
test('pending gate is blocked', () => {
  assert.ok(evaluate({ checks: checks().map((x) => x.name === 'Container runtime smoke'
    ? { ...x, status: 'in_progress', conclusion: null } : x) }).reasons.includes('CHECK_UNVERIFIED:Container runtime smoke'));
});
test('contradictory rerun results require human inspection', () => {
  const result = evaluate({ checks: [...checks(), {
    name: 'Quality Gate', head_sha: HEAD, status: 'completed', conclusion: 'failure',
  }] });
  assert.ok(result.reasons.includes('CHECK_UNVERIFIED:Quality Gate'));
});
test('invalid or unavailable source data never passes', () => {
  assert.equal(assessIntegrationReadiness({ pull: null, baseSha: BASE, checks: checks() }).status, 'HOLD');
  assert.ok(evaluate({ checks: null }).reasons.includes('INVALID_CHECK_DATA'));
  assert.ok(evaluate({ pull: { ...makePull(), head: { sha: 'oops' } } }).reasons.includes('INVALID_HEAD_SHA'));
});
