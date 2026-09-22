import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';

import type {
  GoogleOAuthAttemptRecord,
  GoogleOAuthAttemptStore,
} from './google.types';
import {
  GoogleOAuthAttempt,
  type GoogleOAuthAttemptDocument,
} from './schemas/google-oauth-attempt.schema';

function toRecord(
  document: GoogleOAuthAttemptDocument,
): GoogleOAuthAttemptRecord {
  return {
    id: document.attemptId,
    stateHash: document.stateHash,
    nonceHash: document.nonceHash,
    codeVerifier: document.codeVerifier,
    intent: document.intent,
    userId: document.userId,
    returnPath: document.returnPath,
    createdAt: document.createdAt,
    expiresAt: document.expiresAt,
  };
}

@Injectable()
export class MongoGoogleOAuthAttemptStore implements GoogleOAuthAttemptStore {
  constructor(
    @InjectModel(GoogleOAuthAttempt.name)
    private readonly model: Model<GoogleOAuthAttemptDocument>,
  ) {}

  async create(input: GoogleOAuthAttemptRecord): Promise<void> {
    await this.model.create({
      attemptId: input.id,
      stateHash: input.stateHash,
      nonceHash: input.nonceHash,
      codeVerifier: input.codeVerifier,
      intent: input.intent,
      userId: input.userId,
      returnPath: input.returnPath,
      createdAt: input.createdAt,
      expiresAt: input.expiresAt,
    });
  }

  async consumeByStateHash(
    stateHash: string,
    now: Date,
  ): Promise<GoogleOAuthAttemptRecord | null> {
    const document = await this.model
      .findOneAndDelete({
        stateHash,
        expiresAt: { $gt: now },
      })
      .exec();

    return document ? toRecord(document) : null;
  }
}
