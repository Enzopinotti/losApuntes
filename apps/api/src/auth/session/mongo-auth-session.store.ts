import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';

import {
  type AuthSessionRecord,
  type AuthSessionStore,
  type CreateAuthSessionRecord,
} from './auth-session.types';
import {
  AuthSession,
  type AuthSessionDocument,
} from './schemas/auth-session.schema';

function toRecord(document: AuthSessionDocument): AuthSessionRecord {
  return {
    id: document.sessionId,
    userId: document.userId,
    tokenHash: document.tokenHash,
    clientType: document.clientType,
    createdAt: document.createdAt,
    lastSeenAt: document.lastSeenAt,
    expiresAt: document.expiresAt,
  };
}

@Injectable()
export class MongoAuthSessionStore implements AuthSessionStore {
  constructor(
    @InjectModel(AuthSession.name)
    private readonly model: Model<AuthSessionDocument>,
  ) {}

  async create(input: CreateAuthSessionRecord): Promise<AuthSessionRecord> {
    const document = await this.model.create({
      sessionId: input.id,
      userId: input.userId,
      tokenHash: input.tokenHash,
      clientType: input.clientType,
      createdAt: input.createdAt,
      lastSeenAt: input.lastSeenAt,
      expiresAt: input.expiresAt,
    });
    return toRecord(document);
  }

  async findActiveByTokenHash(
    tokenHash: string,
    now: Date,
  ): Promise<AuthSessionRecord | null> {
    const document = await this.model
      .findOne({
        tokenHash,
        expiresAt: { $gt: now },
      })
      .exec();

    return document ? toRecord(document) : null;
  }

  async listActiveForUser(
    userId: string,
    now: Date,
  ): Promise<AuthSessionRecord[]> {
    const documents = await this.model
      .find({
        userId,
        expiresAt: { $gt: now },
      })
      .sort({ createdAt: -1, sessionId: -1 })
      .exec();

    return documents.map(toRecord);
  }

  async touchLastSeen(sessionId: string, lastSeenAt: Date): Promise<void> {
    await this.model
      .updateOne(
        { sessionId },
        {
          $max: { lastSeenAt },
        },
      )
      .exec();
  }

  async revokeByTokenHash(tokenHash: string): Promise<void> {
    await this.model.deleteOne({ tokenHash }).exec();
  }

  async revokeOwnedById(userId: string, sessionId: string): Promise<boolean> {
    const result = await this.model
      .deleteOne({
        sessionId,
        userId,
      })
      .exec();

    return result.deletedCount === 1;
  }

  async revokeAllForUser(userId: string): Promise<void> {
    await this.model.deleteMany({ userId }).exec();
  }
}
