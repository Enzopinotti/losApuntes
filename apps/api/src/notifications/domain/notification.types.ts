export const NOTIFICATION_TYPES = [
  'social.followed',
  'social.connection_requested',
  'social.connection_accepted',
  'qa.question_answered',
  'qa.answer_accepted',
] as const;

export type NotificationType = (typeof NOTIFICATION_TYPES)[number];

export const NOTIFICATION_TARGET_TYPES = [
  'profile',
  'connection',
  'question',
  'answer',
] as const;

export type NotificationTargetType =
  (typeof NOTIFICATION_TARGET_TYPES)[number];

export interface NotificationRecord {
  id: string;
  userId: string;
  type: NotificationType;
  actorUserId: string | null;
  targetType: NotificationTargetType;
  targetId: string;
  readAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export type CreateNotificationRecord = Omit<
  NotificationRecord,
  'createdAt' | 'updatedAt'
>;

export interface NotificationCursor {
  createdAt: Date;
  id: string;
}
