import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';

import {
  CONNECTION_STATUSES,
  type ConnectionStatus,
} from '../domain/social.types';

@Schema({ collection: 'social_follows', timestamps: true })
export class SocialFollow {
  @Prop({ required: true, unique: true, index: true })
  id!: string;

  @Prop({ required: true, index: true })
  followerUserId!: string;

  @Prop({ required: true, index: true })
  followeeUserId!: string;

  createdAt!: Date;
  updatedAt!: Date;
}

export const SocialFollowSchema = SchemaFactory.createForClass(SocialFollow);
SocialFollowSchema.index(
  { followerUserId: 1, followeeUserId: 1 },
  { unique: true },
);
SocialFollowSchema.index({ followerUserId: 1, createdAt: -1, id: 1 });

@Schema({ collection: 'social_connections', timestamps: true })
export class SocialConnection {
  @Prop({ required: true, unique: true, index: true })
  id!: string;

  @Prop({ required: true, index: true })
  userLowId!: string;

  @Prop({ required: true, index: true })
  userHighId!: string;

  @Prop({ required: true })
  requestedByUserId!: string;

  @Prop({ required: true, enum: CONNECTION_STATUSES, index: true })
  status!: ConnectionStatus;

  @Prop({ type: Date, default: null })
  respondedAt!: Date | null;

  createdAt!: Date;
  updatedAt!: Date;
}

export const SocialConnectionSchema =
  SchemaFactory.createForClass(SocialConnection);
SocialConnectionSchema.index(
  { userLowId: 1, userHighId: 1 },
  { unique: true },
);
SocialConnectionSchema.index({ userLowId: 1, status: 1, updatedAt: -1 });
SocialConnectionSchema.index({ userHighId: 1, status: 1, updatedAt: -1 });
