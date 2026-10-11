export const CONNECTION_STATUSES = [
  'pending',
  'accepted',
  'declined',
  'disconnected',
] as const;

export type ConnectionStatus = (typeof CONNECTION_STATUSES)[number];

export interface SocialCursor {
  at: Date;
  id: string;
}

export interface FollowRecord {
  id: string;
  followerUserId: string;
  followeeUserId: string;
  createdAt: Date;
  updatedAt: Date;
}

export type FollowAccountExportRow = Pick<
  FollowRecord,
  'id' | 'followeeUserId' | 'createdAt'
>;

export interface ConnectionRecord {
  id: string;
  userLowId: string;
  userHighId: string;
  requestedByUserId: string;
  status: ConnectionStatus;
  respondedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export type ConnectionAccountExportRow = Pick<
  ConnectionRecord,
  | 'id'
  | 'userLowId'
  | 'userHighId'
  | 'requestedByUserId'
  | 'status'
  | 'respondedAt'
  | 'createdAt'
  | 'updatedAt'
>;
