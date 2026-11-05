import { Injectable } from '@nestjs/common';
import { InjectConnection, InjectModel } from '@nestjs/mongoose';
import type { ClientSession, Connection, FilterQuery, Model } from 'mongoose';

import { assertNotificationFanoutBudget } from '../../notifications/domain/notification-fanout';
import type { CreateNotificationRecord } from '../../notifications/domain/notification.types';
import { Notification } from '../../notifications/mongo/notification.mongo-schema';
import { User } from '../../users/schemas/user.schema';
import {
  SocialParticipantInactiveError,
  type SocialStore,
} from '../domain/social.store';
import type { ConnectionRequestDirection } from '../domain/connection-request.cursor';
import type {
  ConnectionAccountExportRow,
  ConnectionRecord,
  ConnectionStatus,
  FollowAccountExportRow,
  FollowRecord,
  SocialCursor,
} from '../domain/social.types';
import { SocialConnection, SocialFollow } from './social.mongo-schemas';

function pair(left: string, right: string): [string, string] {
  return left < right ? [left, right] : [right, left];
}

function isDuplicateKeyError(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    error.code === 11000
  );
}

@Injectable()
export class MongoSocialStore implements SocialStore {
  constructor(
    @InjectConnection()
    private readonly connection: Connection,
    @InjectModel(SocialFollow.name)
    private readonly follows: Model<SocialFollow>,
    @InjectModel(SocialConnection.name)
    private readonly connections: Model<SocialConnection>,
    @InjectModel(Notification.name)
    private readonly notifications: Model<Notification>,
    @InjectModel(User.name)
    private readonly users: Model<User>,
  ) {}

  private async fenceActiveAccount(
    userId: string,
    session: ClientSession,
  ): Promise<void> {
    // The shared User write makes this transaction serialize with account closure.
    const active = await this.users
      .findOneAndUpdate(
        {
          _id: userId,
          $or: [
            { account_status: 'active' },
            { account_status: { $exists: false } },
          ],
        },
        { $inc: { account_lifecycle_revision: 1 } },
        { new: false, session },
      )
      .lean()
      .exec();

    if (!active) throw new SocialParticipantInactiveError();
  }

  private async fenceActiveParticipants(
    userIds: string[],
    session: ClientSession,
  ): Promise<void> {
    for (const userId of [...new Set(userIds)].sort()) {
      await this.fenceActiveAccount(userId, session);
    }
  }

  async follow(input: {
    id: string;
    followerUserId: string;
    followeeUserId: string;
    notification: CreateNotificationRecord;
  }): Promise<{ follow: FollowRecord; created: boolean }> {
    assertNotificationFanoutBudget([input.notification]);
    const session = await this.connection.startSession();

    try {
      let result: { follow: FollowRecord; created: boolean } | undefined;

      await session.withTransaction(async () => {
        const existing = await this.follows
          .findOne({
            followerUserId: input.followerUserId,
            followeeUserId: input.followeeUserId,
          })
          .session(session)
          .lean<FollowRecord>()
          .exec();

        if (existing) {
          result = { follow: existing, created: false };
          return;
        }

        await this.fenceActiveParticipants(
          [input.followerUserId, input.followeeUserId],
          session,
        );

        const write = await this.follows
          .updateOne(
            {
              followerUserId: input.followerUserId,
              followeeUserId: input.followeeUserId,
            },
            {
              $setOnInsert: {
                id: input.id,
                followerUserId: input.followerUserId,
                followeeUserId: input.followeeUserId,
              },
            },
            { upsert: true, session },
          )
          .exec();

        const created = write.upsertedCount === 1;
        if (created) {
          await this.notifications.create([input.notification], { session });
        }

        const follow = await this.follows
          .findOne({
            followerUserId: input.followerUserId,
            followeeUserId: input.followeeUserId,
          })
          .session(session)
          .lean<FollowRecord>()
          .exec();

        if (!follow) throw new Error('Follow upsert returned no row');
        result = { follow, created };
      });

      if (!result) throw new Error('Follow transaction returned no result');
      return result;
    } catch (error) {
      if (isDuplicateKeyError(error)) {
        const raced = await this.follows
          .findOne({
            followerUserId: input.followerUserId,
            followeeUserId: input.followeeUserId,
          })
          .lean<FollowRecord>()
          .exec();

        if (raced) return { follow: raced, created: false };
      }

      throw error;
    } finally {
      await session.endSession();
    }
  }

  async unfollow(
    followerUserId: string,
    followeeUserId: string,
  ): Promise<void> {
    await this.follows.deleteOne({ followerUserId, followeeUserId }).exec();
  }

  async listFollowing(
    userId: string,
    limit: number,
    after?: SocialCursor,
  ): Promise<FollowRecord[]> {
    const filters: FilterQuery<SocialFollow>[] = [{ followerUserId: userId }];

    if (after) {
      filters.push({
        $or: [
          { createdAt: { $lt: after.at } },
          { createdAt: after.at, id: { $gt: after.id } },
        ],
      });
    }

    return this.follows
      .find({ $and: filters })
      .sort({ createdAt: -1, id: 1 })
      .limit(limit)
      .lean<FollowRecord[]>()
      .exec();
  }

  async listFollowingForAccountExport(
    userId: string,
    limit: number,
    after?: SocialCursor,
  ): Promise<{ items: FollowAccountExportRow[]; hasMore: boolean }> {
    const filters: FilterQuery<SocialFollow>[] = [{ followerUserId: userId }];

    if (after) {
      filters.push({
        $or: [
          { createdAt: { $lt: after.at } },
          { createdAt: after.at, id: { $gt: after.id } },
        ],
      });
    }

    const rows = await this.follows
      .find({ $and: filters })
      .select({ _id: 0, id: 1, followeeUserId: 1, createdAt: 1 })
      .sort({ createdAt: -1, id: 1 })
      .limit(limit + 1)
      .lean<FollowAccountExportRow[]>()
      .exec();

    return {
      items: rows.slice(0, limit),
      hasMore: rows.length > limit,
    };
  }

  async requestConnection(input: {
    id: string;
    requesterUserId: string;
    targetUserId: string;
    notification: CreateNotificationRecord;
    now: Date;
  }): Promise<{ connection: ConnectionRecord; changed: boolean }> {
    assertNotificationFanoutBudget([input.notification]);
    const [userLowId, userHighId] = pair(
      input.requesterUserId,
      input.targetUserId,
    );
    const session = await this.connection.startSession();

    try {
      let result:
        { connection: ConnectionRecord; changed: boolean } | undefined;

      await session.withTransaction(async () => {
        const existing = await this.connections
          .findOne({ userLowId, userHighId })
          .session(session)
          .lean<ConnectionRecord>()
          .exec();

        if (existing && ['pending', 'accepted'].includes(existing.status)) {
          result = { connection: existing, changed: false };
          return;
        }

        if (existing) {
          await this.fenceActiveParticipants(
            [input.requesterUserId, input.targetUserId],
            session,
          );

          const reopened = await this.connections
            .findOneAndUpdate(
              {
                id: existing.id,
                status: { $in: ['declined', 'disconnected'] },
              },
              {
                $set: {
                  requestedByUserId: input.requesterUserId,
                  status: 'pending',
                  respondedAt: null,
                },
              },
              { new: true, session },
            )
            .lean<ConnectionRecord>()
            .exec();

          if (!reopened) {
            const raced = await this.connections
              .findOne({ userLowId, userHighId })
              .session(session)
              .lean<ConnectionRecord>()
              .exec();
            if (!raced) throw new Error('Connection disappeared concurrently');
            result = { connection: raced, changed: false };
            return;
          }

          await this.notifications.create(
            [
              {
                ...input.notification,
                targetId: reopened.id,
              },
            ],
            { session },
          );
          result = { connection: reopened, changed: true };
          return;
        }

        await this.fenceActiveParticipants(
          [input.requesterUserId, input.targetUserId],
          session,
        );

        const created = await this.connections.create(
          [
            {
              id: input.id,
              userLowId,
              userHighId,
              requestedByUserId: input.requesterUserId,
              status: 'pending',
              respondedAt: null,
            },
          ],
          { session },
        );
        const connection = created[0];
        if (!connection) throw new Error('Connection create returned no row');
        await this.notifications.create([input.notification], { session });
        result = {
          connection: connection.toObject(),
          changed: true,
        };
      });

      if (!result) throw new Error('Connection transaction returned no result');
      return result;
    } catch (error) {
      if (isDuplicateKeyError(error)) {
        const raced = await this.connections
          .findOne({ userLowId, userHighId })
          .lean<ConnectionRecord>()
          .exec();
        if (raced) return { connection: raced, changed: false };
      }

      throw error;
    } finally {
      await session.endSession();
    }
  }

  async findConnectionById(id: string): Promise<ConnectionRecord | null> {
    return this.connections.findOne({ id }).lean<ConnectionRecord>().exec();
  }

  async listConnections(
    userId: string,
    status: ConnectionStatus | undefined,
    limit: number,
    after?: SocialCursor,
    direction?: ConnectionRequestDirection,
  ): Promise<ConnectionRecord[]> {
    const filters: FilterQuery<SocialConnection>[] = [
      { $or: [{ userLowId: userId }, { userHighId: userId }] },
    ];

    if (status) filters.push({ status });
    if (direction) {
      // Only actionable pending requests support direction. No post-pagination
      // filtering: the database must scope before sort/limit.
      filters.push({ status: 'pending' });
      filters.push(
        direction === 'outgoing'
          ? { requestedByUserId: userId }
          : { requestedByUserId: { $ne: userId } },
      );
    }

    if (after) {
      filters.push({
        $or: [
          { updatedAt: { $lt: after.at } },
          { updatedAt: after.at, id: { $gt: after.id } },
        ],
      });
    }

    return this.connections
      .find({ $and: filters })
      .sort({ updatedAt: -1, id: 1 })
      .limit(limit)
      .lean<ConnectionRecord[]>()
      .exec();
  }

  async countIncomingConnectionRequests(userId: string): Promise<number> {
    return this.connections
      .countDocuments({
        status: 'pending',
        requestedByUserId: { $ne: userId },
        $or: [{ userLowId: userId }, { userHighId: userId }],
      })
      .exec();
  }

  async listConnectionsForAccountExport(
    userId: string,
    limit: number,
    after?: SocialCursor,
  ): Promise<{ items: ConnectionAccountExportRow[]; hasMore: boolean }> {
    const filters: FilterQuery<SocialConnection>[] = [
      { $or: [{ userLowId: userId }, { userHighId: userId }] },
    ];

    if (after) {
      filters.push({
        $or: [
          { updatedAt: { $lt: after.at } },
          { updatedAt: after.at, id: { $gt: after.id } },
        ],
      });
    }

    const rows = await this.connections
      .find({ $and: filters })
      .select({
        _id: 0,
        id: 1,
        userLowId: 1,
        userHighId: 1,
        requestedByUserId: 1,
        status: 1,
        respondedAt: 1,
        createdAt: 1,
        updatedAt: 1,
      })
      .sort({ updatedAt: -1, id: 1 })
      .limit(limit + 1)
      .lean<ConnectionAccountExportRow[]>()
      .exec();

    return {
      items: rows.slice(0, limit),
      hasMore: rows.length > limit,
    };
  }

  async respondConnection(input: {
    id: string;
    recipientUserId: string;
    status: 'accepted' | 'declined';
    notification?: CreateNotificationRecord;
    now: Date;
  }): Promise<ConnectionRecord | null> {
    if (input.notification) {
      assertNotificationFanoutBudget([input.notification]);
    }
    const session = await this.connection.startSession();

    try {
      let result: ConnectionRecord | null = null;

      await session.withTransaction(async () => {
        if (input.status === 'accepted') {
          const pending = await this.connections
            .findOne({
              id: input.id,
              status: 'pending',
              requestedByUserId: { $ne: input.recipientUserId },
              $or: [
                { userLowId: input.recipientUserId },
                { userHighId: input.recipientUserId },
              ],
            })
            .session(session)
            .lean<ConnectionRecord>()
            .exec();

          if (!pending) return;

          await this.fenceActiveParticipants(
            [pending.requestedByUserId, input.recipientUserId],
            session,
          );
        }

        result = await this.connections
          .findOneAndUpdate(
            {
              id: input.id,
              status: 'pending',
              requestedByUserId: { $ne: input.recipientUserId },
              $or: [
                { userLowId: input.recipientUserId },
                { userHighId: input.recipientUserId },
              ],
            },
            {
              $set: {
                status: input.status,
                respondedAt: input.now,
              },
            },
            { new: true, session },
          )
          .lean<ConnectionRecord>()
          .exec();

        if (result && input.notification) {
          await this.notifications.create([input.notification], { session });
        }
      });

      return result;
    } finally {
      await session.endSession();
    }
  }

  async disconnectConnection(
    id: string,
    userId: string,
    now: Date,
  ): Promise<ConnectionRecord | null> {
    return this.connections
      .findOneAndUpdate(
        {
          id,
          status: 'accepted',
          $or: [{ userLowId: userId }, { userHighId: userId }],
        },
        {
          $set: {
            status: 'disconnected',
            respondedAt: now,
          },
        },
        { new: true },
      )
      .lean<ConnectionRecord>()
      .exec();
  }
}
