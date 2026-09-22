import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import type { HydratedDocument } from 'mongoose';

import type { GoogleOAuthIntent } from '../google.types';

export type GoogleOAuthAttemptDocument = HydratedDocument<GoogleOAuthAttempt>;

@Schema({
  collection: 'auth_google_oauth_attempts',
  versionKey: false,
})
export class GoogleOAuthAttempt {
  @Prop({ required: true, unique: true })
  attemptId!: string;

  @Prop({ required: true, unique: true })
  stateHash!: string;

  @Prop({ required: true })
  nonceHash!: string;

  @Prop({ required: true })
  codeVerifier!: string;

  @Prop({ required: true, enum: ['login', 'link'] })
  intent!: GoogleOAuthIntent;

  @Prop()
  userId?: string;

  @Prop({ required: true })
  returnPath!: string;

  @Prop({ required: true })
  createdAt!: Date;

  @Prop({ required: true })
  expiresAt!: Date;
}

export const GoogleOAuthAttemptSchema =
  SchemaFactory.createForClass(GoogleOAuthAttempt);

GoogleOAuthAttemptSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
