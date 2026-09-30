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
    credentialVersion: document.credentialVersion ?? 1,
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
      credentialVersion: input.credentialVersion,
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
    input: Parameters<AuthSessionStore['listActiveForUser']>[0],
  ): ReturnType<AuthSessionStore['listActiveForUser']> {
    const documents = await this.model
      .find({
        userId: input.userId,
        credentialVersion: input.credentialVersion,
        expiresAt: { $gt: input.now },
        $or: [
          {
            clientType: 'web',
            lastSeenAt: { $gt: input.webIdleAfter },
          },
          {
            clientType: 'mobile',
            lastSeenAt: { $gt: input.mobileIdleAfter },
          },
        ],
      })
      .sort({ lastSeenAt: -1, sessionId: -1 })
      .limit(input.limit + 1)
      .exec();

    return {
      items: documents.slice(0, input.limit).map(toRecord),
      hasMore: documents.length > input.limit,
    };
  }

  async findActiveOwnedById(
    userId: string,
    sessionId: string,
    credentialVersion: number,
    now: Date,
  ): Promise<AuthSessionRecord | null> {
    const document = await this.model
      .findOne({
        userId,
        sessionId,
        credentialVersion,
        expiresAt: { $gt: now },
      })
      .exec();

    return document ? toRecord(document) : null;
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
