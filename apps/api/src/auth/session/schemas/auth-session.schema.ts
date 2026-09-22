import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import type { HydratedDocument } from 'mongoose';

import type { AuthClientType } from '../auth-session.types';

export type AuthSessionDocument = HydratedDocument<AuthSession>;

@Schema({
  collection: 'auth_sessions',
  versionKey: false,
})
export class AuthSession {
  @Prop({ required: true, index: true })
  userId!: string;

  @Prop({ required: true, unique: true, index: true })
  tokenHash!: string;

  @Prop({ required: true, enum: ['web', 'mobile'] })
  clientType!: AuthClientType;

  @Prop({ required: true })
  createdAt!: Date;

  @Prop({ required: true })
  lastSeenAt!: Date;

  @Prop({ required: true, index: true })
  expiresAt!: Date;
}

export const AuthSessionSchema = SchemaFactory.createForClass(AuthSession);

AuthSessionSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
AuthSessionSchema.index({ userId: 1, expiresAt: -1, createdAt: -1 });
