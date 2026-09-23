import type { CreateNotificationRecord } from '../../notifications/domain/notification.types';
import type {
  ConnectionRecord,
  ConnectionStatus,
  FollowRecord,
  SocialCursor,
} from './social.types';

export const SOCIAL_STORE = Symbol('SOCIAL_STORE');

export interface SocialStore {
  follow: (input: {
    id: string;
    followerUserId: string;
    followeeUserId: string;
    notification: CreateNotificationRecord;
  }) => Promise<{ follow: FollowRecord; created: boolean }>;
  unfollow: (followerUserId: string, followeeUserId: string) => Promise<void>;
  listFollowing: (
    userId: string,
    limit: number,
    after?: SocialCursor,
  ) => Promise<FollowRecord[]>;

  requestConnection: (input: {
    id: string;
    requesterUserId: string;
    targetUserId: string;
    notification: CreateNotificationRecord;
    now: Date;
  }) => Promise<{ connection: ConnectionRecord; changed: boolean }>;
  findConnectionById: (id: string) => Promise<ConnectionRecord | null>;
  listConnections: (
    userId: string,
    status: ConnectionStatus | undefined,
    limit: number,
    after?: SocialCursor,
  ) => Promise<ConnectionRecord[]>;
  respondConnection: (input: {
    id: string;
    recipientUserId: string;
    status: 'accepted' | 'declined';
    notification?: CreateNotificationRecord;
    now: Date;
  }) => Promise<ConnectionRecord | null>;
  disconnectConnection: (
    id: string,
    userId: string,
    now: Date,
  ) => Promise<ConnectionRecord | null>;
}
