import { Injectable, Optional } from '@nestjs/common';
import { InjectConnection, InjectModel } from '@nestjs/mongoose';
import type { Connection, Model } from 'mongoose';
import { User } from '../../users/schemas/user.schema';

import type { AccountExportStore } from '../domain/account-export.store';
import { AccountExportEpochConflictError } from '../domain/account-export-epoch-conflict.error';
import {
  isAccountExportFailureCode,
  type AccountExportJobRecord,
} from '../domain/account-export.types';
import { AccountExportJob } from './account-export.mongo-schema';
import { AccountExportOrphanCleanup } from './account-export-orphan-cleanup.schema';

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
    @InjectModel(User.name)
    private readonly users: Model<User>,
    @InjectConnection()
    private readonly connection: Connection,
    // Optional for historical direct-store fixtures. The real Nest module
    // always registers this model; expiry retirement fails closed otherwise.
    @Optional() @InjectModel(AccountExportOrphanCleanup.name)
    private readonly orphanCleanup?: Model<AccountExportOrphanCleanup>,
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
              completedAt: null,
              artifactSectionCount: null,
              artifactRecordCount: null,
              artifactByteLength: null,
              artifactSha256: null,
              artifactGeneration: null,
              artifactExpiresAt: null,
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

  async findForOrphanCleanup(id: string): Promise<AccountExportJobRecord | null> {
    return this.jobs
      .findOne({ id })
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

  async renewLease(
    input: Parameters<AccountExportStore['renewLease']>[0],
  ): ReturnType<AccountExportStore['renewLease']> {
    const result = await this.jobs
      .updateOne(
        {
          id: input.id,
          active: true,
          state: 'processing',
          claimId: input.claimId,
          leaseExpiresAt: { $gt: input.now },
        },
        {
          $max: { leaseExpiresAt: input.leaseExpiresAt },
        },
      )
      .exec();

    return result.matchedCount === 1;
  }

  async reschedule(
    input: Parameters<AccountExportStore['reschedule']>[0],
  ): ReturnType<AccountExportStore['reschedule']> {
    if (!isAccountExportFailureCode(input.failureCode)) {
      throw new Error('Account export failure code is invalid');
    }

    const result = await this.jobs
      .updateOne(
        {
          id: input.id,
          active: true,
          state: 'processing',
          claimId: input.claimId,
          leaseExpiresAt: { $gt: input.now },
        },
        {
          $set: {
            state: input.state,
            active: input.state === 'pending',
            nextAttemptAt: input.nextAttemptAt,
            failureCode: input.failureCode,
            failedAt: input.state === 'failed' ? input.now : null,
            completedAt: null,
            artifactSectionCount: null,
            artifactRecordCount: null,
            artifactByteLength: null,
            artifactSha256: null,
            artifactGeneration: null,
            artifactExpiresAt: null,
            claimId: null,
            leaseExpiresAt: null,
          },
        },
      )
      .exec();

    return result.modifiedCount === 1;
  }

  async complete(
    input: Parameters<AccountExportStore['complete']>[0],
  ): ReturnType<AccountExportStore['complete']> {
    const filter = {
      id: input.id,
      active: true,
      state: 'processing',
      formatVersion: input.result.formatVersion,
      claimId: input.claimId,
      leaseExpiresAt: { $gt: input.completedAt },
    };
    const update = {
      $set: {
        state: 'completed',
        active: false,
        claimId: null,
        leaseExpiresAt: null,
        failureCode: null,
        failedAt: null,
        completedAt: input.completedAt,
        artifactSectionCount: input.result.sectionCount,
        artifactRecordCount: input.result.recordCount,
        artifactByteLength: input.result.byteLength,
        artifactSha256: input.result.sha256,
        artifactGeneration: input.artifactGeneration,
        artifactExpiresAt: input.artifactExpiresAt,
      },
    };
    // Preserve the historical single-document CAS for v1/v2. Neither
    // protocol relies on the Study Progress owner revision.
    if (input.result.formatVersion !== 3) {
      const result = await this.jobs.updateOne(filter, update).exec();
      return result.modifiedCount === 1;
    }

    const ownerUserId = input.ownerUserId;
    const expected = input.expectedProgressEpoch;
    if (typeof ownerUserId !== 'string' || !ownerUserId.trim() ||
      !Number.isSafeInteger(expected) || (expected as number) < 0) {
      throw new Error('Account export v3 completion owner epoch is required');
    }
    const expectedEpoch = expected as number;
    // Both progress mutations and account closure write the SAME User row
    // in Mongo transactions. Do not allow a progress mutation to race
    // between the worker's post-S3 check and durable job completion.
    const ownerFilter = {
      _id: ownerUserId,
      $and: [
        { $or: [
          { account_status: 'active' },
          { account_status: { $exists: false } },
        ] },
        expectedEpoch === 0
          ? { $or: [
              { account_lifecycle_revision: 0 },
              { account_lifecycle_revision: { $exists: false } },
            ] }
          : { account_lifecycle_revision: expectedEpoch },
      ],
    };
    class LostClaim extends Error {}
    const session = await this.connection.startSession();
    try {
      await session.withTransaction(async () => {
        const fenced = await this.users
          .updateOne(ownerFilter,
            { $inc: { account_lifecycle_revision: 1 } },
            { session },
          ).exec();
        if (fenced.matchedCount !== 1) {
          throw new AccountExportEpochConflictError();
        }
        const completed = await this.jobs
          .updateOne({ ...filter, userId: ownerUserId }, update, { session }).exec();
        if (completed.modifiedCount !== 1) {
          // The User increment must rollback along with the lost claim.
          throw new LostClaim('Account export completion claim changed');
        }
      });
      return true;
    } catch (error) {
      if (error instanceof LostClaim) return false;
      throw error;
    } finally {
      await session.endSession();
    }
  }

  async findExpiredArtifacts(
    input: Parameters<AccountExportStore['findExpiredArtifacts']>[0],
  ): ReturnType<AccountExportStore['findExpiredArtifacts']> {
    const jobs = await this.jobs
      .find({
        state: 'completed',
        artifactGeneration: { $type: 'string' },
        artifactExpiresAt: { $lte: input.now },
      })
      .sort({ artifactExpiresAt: 1, id: 1 })
      .limit(input.limit)
      .select({ id: 1, artifactGeneration: 1, artifactExpiresAt: 1 })
      .lean<
        Array<{
          id: string;
          artifactGeneration: string;
          artifactExpiresAt: Date;
        }>
      >()
      .exec();

    return jobs.map((job) => ({
      id: job.id,
      generation: job.artifactGeneration,
      expiresAt: job.artifactExpiresAt,
    }));
  }

  async retireExpiredArtifact(
    input: Parameters<AccountExportStore['retireExpiredArtifact']>[0],
  ): ReturnType<AccountExportStore['retireExpiredArtifact']> {
    if (!this.orphanCleanup) {
      throw new Error('Account export expiry queue is not registered');
    }
    const session = await this.connection.startSession();
    let retired = false;
    try {
      await session.withTransaction(async () => {
        // withTransaction may retry this callback after a transient abort.
        // Do not retain a successful flag from a rolled-back attempt.
        retired = false;
        // CAS the original expiry and generation BEFORE creating any S3
        // deletion intent. A concurrent extension or changed reference must
        // leave both the job and the cleanup queue unchanged.
        const previous = await this.jobs
          .findOneAndUpdate(
            {
              id: input.id,
              state: 'completed',
              artifactGeneration: input.generation,
              artifactExpiresAt: {
                $eq: input.expiresAt,
                $lte: input.now,
              },
            },
            { $set: { artifactGeneration: null } },
            { session, new: false },
          )
          .lean<{ id: string; userId: string; artifactGeneration: string }>()
          .exec();
        if (!previous) return;
        if (previous.id !== input.id ||
          previous.artifactGeneration !== input.generation ||
          !previous.userId?.trim()) {
          throw new Error('Account export expired artifact owner is invalid');
        }

        // This write and the job's unlink MUST commit atomically. If the
        // worker crashes or a Mongo ACK is lost, the queue survives for
        // B67-B71 claim-fenced compensation on its next iteration.
        await this.orphanCleanup!.updateOne(
          { jobId: input.id, generation: input.generation },
          {
            $setOnInsert: {
              jobId: input.id,
              ownerUserId: previous.userId,
              generation: input.generation,
              state: 'pending',
              attempts: 0,
              nextAttemptAt: input.now,
              claimId: null,
              leaseExpiresAt: null,
            },
          },
          { upsert: true, session },
        ).exec();
        retired = true;
      });
      return retired;
    } finally {
      await session.endSession();
    }
  }

  async hasFailed(): Promise<boolean> {
    return Boolean(await this.jobs.exists({ state: 'failed' }));
  }
}
