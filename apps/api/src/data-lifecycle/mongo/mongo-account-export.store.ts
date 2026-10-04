import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import type { Model } from 'mongoose';

import type { AccountExportStore } from '../domain/account-export.store';
import type { AccountExportJobRecord } from '../domain/account-export.types';
import { AccountExportJob } from './account-export.mongo-schema';

function isDuplicateKey(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code?: unknown }).code === 11000
  );
}

@Injectable()
export class MongoAccountExportStore implements AccountExportStore {
  constructor(
    @InjectModel(AccountExportJob.name)
    private readonly jobs: Model<AccountExportJob>,
  ) {}

  async requestActive(
    input: Parameters<AccountExportStore['requestActive']>[0],
  ): ReturnType<AccountExportStore['requestActive']> {
    try {
      const job = await this.jobs
        .findOneAndUpdate(
          { userId: input.userId, active: true },
          {
            $setOnInsert: {
              id: input.id,
              userId: input.userId,
              state: 'pending',
              active: true,
              formatVersion: input.formatVersion,
              attempts: 0,
              nextAttemptAt: input.now,
              claimId: null,
              leaseExpiresAt: null,
              failureCode: null,
              failedAt: null,
            },
          },
          { upsert: true, new: true },
        )
        .lean<AccountExportJobRecord>()
        .exec();

      if (!job) throw new Error('Account export upsert returned no row');
      return { job, created: job.id === input.id };
    } catch (error) {
      if (!isDuplicateKey(error)) throw error;

      const replay = await this.jobs
        .findOne({ userId: input.userId, active: true })
        .lean<AccountExportJobRecord>()
        .exec();

      if (!replay) throw error;
      return { job: replay, created: false };
    }
  }

  async findOwned(
    id: string,
    userId: string,
  ): Promise<AccountExportJobRecord | null> {
    return this.jobs
      .findOne({ id, userId })
      .lean<AccountExportJobRecord>()
      .exec();
  }

  async claimNext(
    input: Parameters<AccountExportStore['claimNext']>[0],
  ): ReturnType<AccountExportStore['claimNext']> {
    return this.jobs
      .findOneAndUpdate(
        {
          active: true,
          $or: [
            { state: 'pending', nextAttemptAt: { $lte: input.now } },
            {
              state: 'processing',
              leaseExpiresAt: { $lte: input.now },
            },
          ],
        },
        {
          $set: {
            state: 'processing',
            claimId: input.claimId,
            leaseExpiresAt: input.leaseExpiresAt,
            failureCode: null,
            failedAt: null,
          },
          $inc: { attempts: 1 },
        },
        {
          new: true,
          sort: { nextAttemptAt: 1, createdAt: 1, userId: 1 },
        },
      )
      .lean<AccountExportJobRecord>()
      .exec();
  }

  async reschedule(
    input: Parameters<AccountExportStore['reschedule']>[0],
  ): ReturnType<AccountExportStore['reschedule']> {
    const result = await this.jobs
      .updateOne(
        {
          id: input.id,
          state: 'processing',
          claimId: input.claimId,
        },
        {
          $set: {
            state: input.state,
            active: input.state === 'pending',
            nextAttemptAt: input.nextAttemptAt,
            failureCode: input.failureCode,
            failedAt: input.failedAt,
            claimId: null,
            leaseExpiresAt: null,
          },
        },
      )
      .exec();

    return result.modifiedCount === 1;
  }

  async hasFailed(): Promise<boolean> {
    return Boolean(await this.jobs.exists({ state: 'failed' }));
  }
}
