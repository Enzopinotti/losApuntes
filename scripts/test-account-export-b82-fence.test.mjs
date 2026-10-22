import assert from 'node:assert/strict';
import test from 'node:test';

import { planAccountExportExpiredClaimFence } from '../apps/api/src/data-lifecycle/domain/account-export-expired-claim-fence.ts';

const now = new Date('2026-10-16T13:00:00.000Z');
const input = {
  id: '11111111-1111-4111-8111-111111111111',
  ownerUserId: 'private-user-id',
  generation: '22222222-2222-4222-8222-222222222222',
  now,
};

test('B82 exact owner and generation must be processing, active and unreferenced', () => {
  assert.deepEqual(planAccountExportExpiredClaimFence(input).filter, {
    id: input.id,
    userId: input.ownerUserId,
    active: true,
    state: 'processing',
    claimId: input.generation,
    leaseExpiresAt: { $lte: now },
    $expr: { $lte: ['$leaseExpiresAt', '$$NOW'] },
    artifactGeneration: null,
  });
});

test('B82 winning CAS revokes original claim before its bytes may be deleted', () => {
  assert.deepEqual(planAccountExportExpiredClaimFence(input).update, {
    $set: {
      state: 'pending',
      claimId: null,
      leaseExpiresAt: null,
      nextAttemptAt: now,
      failureCode: 'EXPORT_ASSEMBLY_RETRY',
      failedAt: null,
    },
  });
});

test('B82 claim fence preserves original input and does not mutate timestamps', () => {
  const before = now.getTime();
  const one = planAccountExportExpiredClaimFence(input);
  const another = planAccountExportExpiredClaimFence(input);
  assert.equal(now.getTime(), before);
  assert.deepEqual(one, another);
  assert.equal(one.filter.leaseExpiresAt.$lte, now);
});

test('B82 forged generation or owner, absent job and invalid dates fail closed', () => {
  const invalid = [
    { ...input, id: '' },
    { ...input, ownerUserId: '' },
    { ...input, ownerUserId: ' ' },
    { ...input, generation: '../outside' },
    { ...input, generation: 'newer-claim' },
    { ...input, generation: '' },
    { ...input, generation: undefined },
    { ...input, now: new Date('invalid') },
    { ...input, now: undefined },
  ];
  for (const value of invalid) {
    assert.throws(() => planAccountExportExpiredClaimFence(value), /fence input is invalid/u);
  }
});

test('B82 CAS cannot match an already completed, newer or renewed claim', () => {
  const plan = planAccountExportExpiredClaimFence(input);
  const matches = (job) =>
    job.id === plan.filter.id &&
    job.userId === plan.filter.userId &&
    job.active === plan.filter.active &&
    job.state === plan.filter.state &&
    job.claimId === plan.filter.claimId &&
    job.artifactGeneration == null &&
    job.leaseExpiresAt instanceof Date &&
    job.leaseExpiresAt.getTime() <= now.getTime();

  const expired = {
    id: input.id, userId: input.ownerUserId, active: true,
    state: 'processing', claimId: input.generation,
    artifactGeneration: null, leaseExpiresAt: new Date(now.getTime() - 1),
  };
  assert.equal(matches(expired), true);
  assert.equal(matches({ ...expired, state: 'completed', active: false,
    artifactGeneration: input.generation }), false);
  assert.equal(matches({ ...expired, claimId: '33333333-3333-4333-8333-333333333333' }), false);
  assert.equal(matches({ ...expired, leaseExpiresAt: new Date(now.getTime() + 1) }), false);
  assert.equal(matches({ ...expired, userId: 'foreign-user' }), false);
  assert.equal(matches({ ...expired, leaseExpiresAt: null }), false);
});
