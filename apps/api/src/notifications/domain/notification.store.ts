import type {
  NotificationCursor,
  NotificationRecord,
} from './notification.types';

export const NOTIFICATION_STORE = Symbol('NOTIFICATION_STORE');

export interface NotificationStore {
  list(input: {
    userId: string;
    unreadOnly: boolean;
    limit: number;
    after?: NotificationCursor;
  }): Promise<{ items: NotificationRecord[]; hasMore: boolean }>;
  markRead(
    userId: string,
    id: string,
    readAt: Date,
  ): Promise<NotificationRecord | null>;
  markAllRead(userId: string, readAt: Date): Promise<number>;
}
