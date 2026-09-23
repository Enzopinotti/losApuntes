import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';

import {
  NOTIFICATION_TARGET_TYPES,
  NOTIFICATION_TYPES,
  type NotificationTargetType,
  type NotificationType,
} from '../domain/notification.types';

@Schema({ collection: 'notifications', timestamps: true })
export class Notification {
  @Prop({ required: true, unique: true, index: true })
  id!: string;

  @Prop({ required: true, index: true })
  userId!: string;

  @Prop({ required: true, enum: NOTIFICATION_TYPES, index: true })
  type!: NotificationType;

  @Prop({ type: String, default: null, index: true })
  actorUserId!: string | null;

  @Prop({ required: true, enum: NOTIFICATION_TARGET_TYPES })
  targetType!: NotificationTargetType;

  @Prop({ required: true })
  targetId!: string;

  @Prop({ type: Date, default: null, index: true })
  readAt!: Date | null;

  createdAt!: Date;
  updatedAt!: Date;
}

export const NotificationSchema = SchemaFactory.createForClass(Notification);
NotificationSchema.index({ userId: 1, createdAt: -1, id: 1 });
NotificationSchema.index({ userId: 1, readAt: 1, createdAt: -1, id: 1 });
