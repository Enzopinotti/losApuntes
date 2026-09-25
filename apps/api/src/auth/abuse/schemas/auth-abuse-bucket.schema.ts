import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import type { HydratedDocument } from 'mongoose';

import {
  AUTH_ABUSE_DIMENSIONS,
  AUTH_ABUSE_OPERATIONS,
  type AuthAbuseDimension,
  type AuthAbuseOperation,
} from '../auth-abuse.types';

export type AuthAbuseBucketDocument = HydratedDocument<AuthAbuseBucket>;

@Schema({
  collection: 'auth_abuse_buckets',
  versionKey: false,
})
export class AuthAbuseBucket {
  @Prop({ required: true, unique: true })
  bucketKey!: string;

  @Prop({ required: true, enum: AUTH_ABUSE_OPERATIONS })
  operation!: AuthAbuseOperation;

  @Prop({ required: true, enum: AUTH_ABUSE_DIMENSIONS })
  dimension!: AuthAbuseDimension;

  @Prop({ required: true })
  windowStartedAt!: Date;

  @Prop({ required: true })
  windowEndsAt!: Date;

  @Prop({ required: true, min: 1 })
  count!: number;

  @Prop({ required: true })
  expiresAt!: Date;
}

export const AuthAbuseBucketSchema =
  SchemaFactory.createForClass(AuthAbuseBucket);

AuthAbuseBucketSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
