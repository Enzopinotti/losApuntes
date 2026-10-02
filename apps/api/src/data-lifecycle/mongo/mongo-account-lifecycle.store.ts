import { Injectable } from '@nestjs/common';
import { InjectConnection, InjectModel } from '@nestjs/mongoose';
import type { Connection, FilterQuery, Model } from 'mongoose';

import type { OrganizationManagerRecord } from '../../organizations/domain/organization.types';
import { OrganizationManager } from '../../organizations/mongo/organization.mongo-schemas';
import { Profile } from '../../profile/mongo/profile.mongo-schemas';
import { User } from '../../users/schemas/user.schema';
import type { AccountLifecycleStore } from '../domain/account-lifecycle.store';
import type {
  AccountClosureManagerBlocker,
  AccountOffboardingJobRecord,
} from '../domain/account-lifecycle.types';
import { AccountOffboardingJob, SecurityAudit } from './data-lifecycle.mongo-schemas';

function credentialVersionClause(expected: number): Record<string, unknown> {
  return expected === 1
    ? {
        $or: [
          { credential_version: 1 },
          { credential_version: { $exists: false } },
        ],
      }
    : { credential_version: expected };
}

const ACTIVE_ACCOUNT_CLAUSE: FilterQuery<User> = {
  $or: [
    { account_status: 'active' },
    { account_status: { $exists: false } },
  ],
};

@Injectable()
export class MongoAccountLifecycleStore implements AccountLifecycleStore {
  constructor(
    @InjectConnection()
    private readonly connection: Connection,
    @InjectModel(User.name)
    private readonly users: Model<User>,
    @InjectModel(Profile.name)
    private readonly profiles: Model<Profile>,
    @InjectModel(OrganizationManager.name)
    private readonly managers: Model<OrganizationManager>,
    @InjectModel(AccountOffboardingJob.name)
    private readonly jobs: Model<AccountOffboardingJob>,
    @InjectModel(SecurityAudit.name)
    private readonly audits: Model<SecurityAudit>,
  ) {}

  async listManagementBlockers(
    userId: string,
    limit: number,
  ): Promise<{ items: AccountClosureManagerBlocker[]; truncated: boolean }> {
    const rows = await this.managers
      .find({ userId })
      .sort({ organizationId: 1 })
      .limit(limit + 1)
      .lean<OrganizationManagerRecord[]>()
      .exec();

    return {
      items: rows.slice(0, limit).map((row) => ({
        organizationId: row.organizationId,
        role: row.role,
      })),
      truncated: rows.length > limit,
    };
  }

  async closeAccount(
    input: Parameters<AccountLifecycleStore['closeAccount']>[0],
  ): ReturnType<AccountLifecycleStore['closeAccount']> {
    const session = await this.connection.startSession();

    try {
      let result: Awaited<ReturnType<AccountLifecycleStore['closeAccount']>> =
        { status: 'revision_conflict' };

      await session.withTransaction(async () => {
        const manager = await this.managers
          .findOne({ userId: input.userId })
          .session(session)
          .lean<OrganizationManagerRecord>()
          .exec();

        if (manager) {
          result = { status: 'manager_blocked' };
          return;
        }

        const closed = await this.users
          .findOneAndUpdate(
            {
              _id: input.userId,
              $and: [
                ACTIVE_ACCOUNT_CLAUSE,
                credentialVersionClause(input.expectedCredentialVersion),
              ],
            },
            {
              $set: {
                account_status: 'closed',
                account_closed_at: input.now,
                credential_version: input.expectedCredentialVersion + 1,
              },
            },
            { new: true, session },
          )
          .lean()
          .exec();

        if (!closed) {
          result = { status: 'revision_conflict' };
          return;
        }

        await this.profiles
          .updateOne(
            { userId: input.userId },
            {
              $set: { lifecycleState: 'closed' },
              $inc: { revision: 1 },
            },
            { session },
          )
          .exec();

        await this.jobs
          .updateOne(
            { userId: input.userId },
            {
              $setOnInsert: {
                id: input.cleanupJobId,
                userId: input.userId,
                state: 'pending',
                attempts: 0,
                nextAttemptAt: input.now,
                claimId: null,
                leaseExpiresAt: null,
                failureCode: null,
                completedAt: null,
              },
            },
            { upsert: true, session },
          )
          .exec();

        await this.audits.create(
          [
            {
              id: input.auditId,
              event: 'account.closed',
              actorUserId: input.userId,
              subjectUserId: input.userId,
              metadata: {
                source: 'self_service',
                cleanupJobId: input.cleanupJobId,
              },
              createdAt: input.now,
            },
          ],
          { session },
        );

        result = { status: 'closed', cleanupJobId: input.cleanupJobId };
      });

      return result;
    } finally {
      await session.endSession();
    }
  }

  async claimNextCleanup(
    input: Parameters<AccountLifecycleStore['claimNextCleanup']>[0],
  ): ReturnType<AccountLifecycleStore['claimNextCleanup']> {
    return this.jobs
      .findOneAndUpdate(
        {
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
          },
          $inc: { attempts: 1 },
        },
        {
          new: true,
          sort: { nextAttemptAt: 1, createdAt: 1, userId: 1 },
        },
      )
      .lean<AccountOffboardingJobRecord>()
      .exec();
  }

  async completeCleanup(
    input: Parameters<AccountLifecycleStore['completeCleanup']>[0],
  ): ReturnType<AccountLifecycleStore['completeCleanup']> {
    const result = await this.jobs
      .updateOne(
        {
          userId: input.userId,
          state: 'processing',
          claimId: input.claimId,
        },
        {
          $set: {
            state: 'completed',
            completedAt: input.completedAt,
            claimId: null,
            leaseExpiresAt: null,
            failureCode: null,
          },
        },
      )
      .exec();

    return result.modifiedCount === 1;
  }

  async rescheduleCleanup(
    input: Parameters<AccountLifecycleStore['rescheduleCleanup']>[0],
  ): ReturnType<AccountLifecycleStore['rescheduleCleanup']> {
    const result = await this.jobs
      .updateOne(
        {
          userId: input.userId,
          state: 'processing',
          claimId: input.claimId,
        },
        {
          $set: {
            state: input.state,
            nextAttemptAt: input.nextAttemptAt,
            failureCode: input.failureCode,
            claimId: null,
            leaseExpiresAt: null,
          },
        },
      )
      .exec();

    return result.modifiedCount === 1;
  }

  async hasFailedCleanup(): Promise<boolean> {
    return Boolean(await this.jobs.exists({ state: 'failed' }));
  }
}
