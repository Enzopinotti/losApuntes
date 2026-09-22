import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import type { HydratedDocument } from 'mongoose';

import type { AuthActionPurpose } from '../auth-action-token.types';

export type AuthActionTokenDocument = HydratedDocument<AuthActionToken>;

@Schema({
  collection: 'auth_action_tokens',
  versionKey: false,
})
export class AuthActionToken {
  @Prop({ required: true, unique: true })
  tokenId!: string;

  @Prop({ required: true })
  userId!: string;

  @Prop({
    required: true,
    enum: ['email_verification', 'password_recovery'],
  })
  purpose!: AuthActionPurpose;

  @Prop({ required: true, unique: true })
  tokenHash!: string;

  @Prop()
  credentialVersion?: number;

  @Prop({ required: true })
  issueBucket!: number;

  @Prop({ required: true })
  createdAt!: Date;

  @Prop({ required: true })
  expiresAt!: Date;

  @Prop({ type: Date, default: null })
  consumedAt!: Date | null;
}

export const AuthActionTokenSchema =
  SchemaFactory.createForClass(AuthActionToken);

AuthActionTokenSchema.index(
  { userId: 1, purpose: 1, issueBucket: 1 },
  { unique: true },
);
AuthActionTokenSchema.index({
  userId: 1,
  purpose: 1,
  consumedAt: 1,
  expiresAt: 1,
  createdAt: -1,
});
AuthActionTokenSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
