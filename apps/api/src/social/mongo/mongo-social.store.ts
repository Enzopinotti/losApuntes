import { Injectable } from '@nestjs/common';
import { InjectConnection, InjectModel } from '@nestjs/mongoose';
import type { Connection, Model } from 'mongoose';

import type { CreateNotificationRecord } from '../../notifications/domain/notification.types';
import { Notification } from '../../notifications/mongo/notification.mongo-schema';
import type { SocialStore } from '../domain/social.store';
import type {
  ConnectionRecord,
  ConnectionStatus,
  FollowRecord,
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
  ) {}

  async follow(input: {
    id: string;
    followerUserId: string;
    followeeUserId: string;
    notification: CreateNotificationRecord;
  }): Promise<{ follow: FollowRecord; created: boolean }> {
    const session = await this.connection.startSession();

    try {
      let result: { follow: FollowRecord; created: boolean } | undefined;

      await session.withTransaction(async () => {
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

  async listFollowing(userId: string, limit: number): Promise<FollowRecord[]> {
    return this.follows
      .find({ followerUserId: userId })
      .sort({ createdAt: -1, id: 1 })
      .limit(limit)
      .lean<FollowRecord[]>()
      .exec();
  }

  async requestConnection(input: {
    id: string;
    requesterUserId: string;
    targetUserId: string;
    notification: CreateNotificationRecord;
    now: Date;
  }): Promise<{ connection: ConnectionRecord; changed: boolean }> {
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

          await this.notifications.create([input.notification], { session });
          result = { connection: reopened, changed: true };
          return;
        }

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
  ): Promise<ConnectionRecord[]> {
    return this.connections
      .find({
        $or: [{ userLowId: userId }, { userHighId: userId }],
        ...(status ? { status } : {}),
      })
      .sort({ updatedAt: -1, id: 1 })
      .limit(limit)
      .lean<ConnectionRecord[]>()
      .exec();
  }

  async respondConnection(input: {
    id: string;
    recipientUserId: string;
    status: 'accepted' | 'declined';
    notification?: CreateNotificationRecord;
    now: Date;
  }): Promise<ConnectionRecord | null> {
    const session = await this.connection.startSession();

    try {
      let result: ConnectionRecord | null = null;

      await session.withTransaction(async () => {
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
