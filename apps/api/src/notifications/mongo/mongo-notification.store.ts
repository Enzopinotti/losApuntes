import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import type { FilterQuery, Model } from 'mongoose';

import type {
  NotificationCursor,
  NotificationRecord,
} from '../domain/notification.types';
import type { NotificationStore } from '../domain/notification.store';
import { Notification } from './notification.mongo-schema';

@Injectable()
export class MongoNotificationStore implements NotificationStore {
  constructor(
    @InjectModel(Notification.name)
    private readonly notifications: Model<Notification>,
  ) {}

  async list(input: {
    userId: string;
    unreadOnly: boolean;
    limit: number;
    after?: NotificationCursor;
  }): Promise<{ items: NotificationRecord[]; hasMore: boolean }> {
    const filters: FilterQuery<Notification>[] = [{ userId: input.userId }];

    if (input.unreadOnly) filters.push({ readAt: null });

    if (input.after) {
      filters.push({
        $or: [
          { createdAt: { $lt: input.after.createdAt } },
          {
            createdAt: input.after.createdAt,
            id: { $gt: input.after.id },
          },
        ],
      });
    }

    const rows = await this.notifications
      .find({ $and: filters })
      .sort({ createdAt: -1, id: 1 })
      .limit(input.limit + 1)
      .lean<NotificationRecord[]>()
      .exec();

    return {
      items: rows.slice(0, input.limit),
      hasMore: rows.length > input.limit,
    };
  }

  async markRead(
    userId: string,
    id: string,
    readAt: Date,
  ): Promise<NotificationRecord | null> {
    return this.notifications
      .findOneAndUpdate(
        { id, userId },
        { $set: { readAt } },
        { new: true },
      )
      .lean<NotificationRecord>()
      .exec();
  }

  async markAllRead(userId: string, readAt: Date): Promise<number> {
    const result = await this.notifications
      .updateMany(
        { userId, readAt: null },
        { $set: { readAt } },
      )
      .exec();

    return result.modifiedCount;
  }
}
