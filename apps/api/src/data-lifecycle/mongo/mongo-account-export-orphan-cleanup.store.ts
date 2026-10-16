import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import type { Model } from 'mongoose';

import {
  type AccountExportOrphanCleanupRecord,
  type AccountExportOrphanCleanupStore,
} from '../domain/account-export-orphan-cleanup.store';
import { AccountExportOrphanCleanup } from './account-export-orphan-cleanup.schema';

function duplicateKey(error: unknown): boolean {
  return typeof error === 'object' && error !== null &&
    'code' in error && error.code === 11000;
}

function validId(value: string): boolean {
  return typeof value === 'string' &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(value);
}

@Injectable()
export class MongoAccountExportOrphanCleanupStore
implements AccountExportOrphanCleanupStore {
  constructor(@InjectModel(AccountExportOrphanCleanup.name)
    private readonly cleanup: Model<AccountExportOrphanCleanup>) {}

  async enqueue(
    input: Parameters<AccountExportOrphanCleanupStore['enqueue']>[0],
  ): Promise<void> {
    if (!validId(input.jobId) || !validId(input.generation) ||
      !input.ownerUserId?.trim() ||
      !(input.now instanceof Date) || !Number.isFinite(input.now.getTime())) {
      throw new Error('Account export orphan cleanup input is invalid');
    }
    try {
      await this.cleanup.updateOne(
        { jobId: input.jobId, generation: input.generation },
        { $setOnInsert: {
          jobId: input.jobId,
          ownerUserId: input.ownerUserId,
          generation: input.generation,
          state: 'pending',
          attempts: 0,
          nextAttemptAt: input.now,
          claimId: null,
          leaseExpiresAt: null,
        } },
        { upsert: true },
      ).exec();
    } catch (error) {
      // An identical generation enqueued by another worker has already won.
      if (!duplicateKey(error)) throw error;
    }
  }

  async clearPending(
    input: Parameters<AccountExportOrphanCleanupStore['clearPending']>[0],
  ): Promise<boolean> {
    const result = await this.cleanup.deleteOne({
      jobId: input.jobId,
      generation: input.generation,
      state: 'pending',
      claimId: null,
      // A worker finishing a late failed attempt must not cancel the
      // takeover's durable verification period. Null matches legacy rows.
      verificationUntil: null,
    }).exec();
    return result.deletedCount === 1;
  }

  async claimNext(
    input: Parameters<AccountExportOrphanCleanupStore['claimNext']>[0],
  ): Promise<AccountExportOrphanCleanupRecord | null> {
    const row = await this.cleanup.findOneAndUpdate(
      {
        $or: [
          { state: 'pending', nextAttemptAt: { $lte: input.now } },
          { state: 'processing', leaseExpiresAt: { $lte: input.now } },
        ],
      },
      { $set: {
        state: 'processing', claimId: input.claimId,
        leaseExpiresAt: input.leaseExpiresAt,
      }, $inc: { attempts: 1 } },
      { new: true, sort: { nextAttemptAt: 1, createdAt: 1, jobId: 1 } },
    ).lean<AccountExportOrphanCleanupRecord>().exec();
    return row ?? null;
  }

  async renewLease(
    input: Parameters<AccountExportOrphanCleanupStore['renewLease']>[0],
  ): Promise<boolean> {
    const result = await this.cleanup.updateOne(
      {
        jobId: input.jobId,
        generation: input.generation,
        state: 'processing',
        claimId: input.claimId,
        leaseExpiresAt: { $gt: input.now },
      },
      { $max: { leaseExpiresAt: input.leaseExpiresAt } },
    ).exec();
    return result.matchedCount === 1;
  }

  async acknowledge(
    input: Parameters<AccountExportOrphanCleanupStore['acknowledge']>[0],
  ): Promise<boolean> {
    const result = await this.cleanup.deleteOne({
      jobId: input.jobId, generation: input.generation,
      state: 'processing', claimId: input.claimId,
      leaseExpiresAt: { $gt: input.now },
    }).exec();
    return result.deletedCount === 1;
  }

  async retry(
    input: Parameters<AccountExportOrphanCleanupStore['retry']>[0],
  ): Promise<boolean> {
    const result = await this.cleanup.updateOne(
      {
        jobId: input.jobId, generation: input.generation,
        state: 'processing', claimId: input.claimId,
        leaseExpiresAt: { $gt: input.now },
      },
      { $set: {
        state: 'pending', claimId: null, leaseExpiresAt: null,
        nextAttemptAt: input.nextAttemptAt,
      } },
    ).exec();
    return result.modifiedCount === 1;
  }
}
