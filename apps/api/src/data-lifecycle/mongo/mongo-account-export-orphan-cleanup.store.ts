import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import type { Model } from 'mongoose';

import {
  type AccountExportOrphanCleanupRecord,
  type AccountExportOrphanCleanupStore,
} from '../domain/account-export-orphan-cleanup.store';
import {
  accountExportOrphanClaimDueOnMongoServer,
  accountExportOrphanOwnedAndDueOnMongoServer,
} from '../domain/account-export-mongo-claim-clock';
import { AccountExportOrphanCleanup } from './account-export-orphan-cleanup.schema';

function duplicateKey(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    error.code === 11000
  );
}

function validId(value: string): boolean {
  return (
    typeof value === 'string' &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(
      value,
    )
  );
}

@Injectable()
export class MongoAccountExportOrphanCleanupStore implements AccountExportOrphanCleanupStore {
  constructor(
    @InjectModel(AccountExportOrphanCleanup.name)
    private readonly cleanup: Model<AccountExportOrphanCleanup>,
  ) {}

  async enqueue(
    input: Parameters<AccountExportOrphanCleanupStore['enqueue']>[0],
  ): Promise<void> {
    if (
      !validId(input.jobId) ||
      !validId(input.generation) ||
      !input.ownerUserId?.trim() ||
      !(input.now instanceof Date) ||
      !Number.isFinite(input.now.getTime())
    ) {
      throw new Error('Account export orphan cleanup input is invalid');
    }
    try {
      await this.cleanup
        .updateOne(
          { jobId: input.jobId, generation: input.generation },
          {
            $setOnInsert: {
              jobId: input.jobId,
              ownerUserId: input.ownerUserId,
              generation: input.generation,
              state: 'pending',
              attempts: 0,
              nextAttemptAt: input.now,
              claimId: null,
              leaseExpiresAt: null,
            },
          },
          { upsert: true },
        )
        .exec();
    } catch (error) {
      // An identical generation enqueued by another worker has already won.
      if (!duplicateKey(error)) throw error;
    }
  }

  async clearPending(
    input: Parameters<AccountExportOrphanCleanupStore['clearPending']>[0],
  ): Promise<boolean> {
    const result = await this.cleanup
      .deleteOne({
        jobId: input.jobId,
        generation: input.generation,
        state: 'pending',
        claimId: null,
        // A worker finishing a late failed attempt must not cancel the
        // takeover's durable verification period. Null matches legacy rows.
        verificationUntil: null,
      })
      .exec();
    return result.deletedCount === 1;
  }

  async claimNext(
    input: Parameters<AccountExportOrphanCleanupStore['claimNext']>[0],
  ): Promise<AccountExportOrphanCleanupRecord | null> {
    const row = await this.cleanup
      .findOneAndUpdate(
        {
          $or: [
            { state: 'pending', nextAttemptAt: { $lte: input.now } },
            {
              state: 'processing',
              leaseExpiresAt: { $lte: input.now },
              // A takeover may extend the settle date while another worker
              // holds a claim. Both the lease AND due time must have passed.
              nextAttemptAt: { $lte: input.now },
            },
          ],
          // Due and prior lease are checked again on Mongo's primary time.
          ...accountExportOrphanClaimDueOnMongoServer(),
        },
        {
          $set: {
            state: 'processing',
            claimId: input.claimId,
            leaseExpiresAt: input.leaseExpiresAt,
          },
          $inc: { attempts: 1 },
        },
        { new: true, sort: { nextAttemptAt: 1, createdAt: 1, jobId: 1 } },
      )
      .lean<AccountExportOrphanCleanupRecord>()
      .exec();
    return row ?? null;
  }

  async renewLease(
    input: Parameters<AccountExportOrphanCleanupStore['renewLease']>[0],
  ): Promise<boolean> {
    const result = await this.cleanup
      .updateOne(
        {
          jobId: input.jobId,
          generation: input.generation,
          state: 'processing',
          claimId: input.claimId,
          leaseExpiresAt: { $gt: input.now },
          verificationUntil: input.verificationUntil ?? null,
          // Refuse lease renewal/retry when the settlement due was extended
          // while a previous worker held the queue claim.
          ...accountExportOrphanOwnedAndDueOnMongoServer(),
        },
        { $max: { leaseExpiresAt: input.leaseExpiresAt } },
      )
      .exec();
    return result.matchedCount === 1;
  }

  async acknowledge(
    input: Parameters<AccountExportOrphanCleanupStore['acknowledge']>[0],
  ): Promise<boolean> {
    const result = await this.cleanup
      .deleteOne({
        jobId: input.jobId,
        generation: input.generation,
        state: 'processing',
        claimId: input.claimId,
        leaseExpiresAt: { $gt: input.now },
        // If a takeover enlarged the horizon after this worker claimed the
        // row, its stale ACK must fail instead of deleting the new intent.
        verificationUntil: input.verificationUntil ?? null,
        ...accountExportOrphanOwnedAndDueOnMongoServer(),
      })
      .exec();
    return result.deletedCount === 1;
  }

  async retry(
    input: Parameters<AccountExportOrphanCleanupStore['retry']>[0],
  ): Promise<boolean> {
    const result = await this.cleanup
      .updateOne(
        {
          jobId: input.jobId,
          generation: input.generation,
          state: 'processing',
          claimId: input.claimId,
          leaseExpiresAt: { $gt: input.now },
          verificationUntil: input.verificationUntil ?? null,
          // Refuse lease renewal/retry when the settlement due was extended
          // while a previous worker held the queue claim.
          ...accountExportOrphanOwnedAndDueOnMongoServer(),
        },
        {
          $set: { state: 'pending', claimId: null, leaseExpiresAt: null },
          // Never move a task earlier than a takeover's settling fence.
          $max: { nextAttemptAt: input.nextAttemptAt },
        },
      )
      .exec();
    return result.modifiedCount === 1;
  }
}
