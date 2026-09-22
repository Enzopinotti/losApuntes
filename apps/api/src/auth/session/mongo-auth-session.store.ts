import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';

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
    id: document._id.toString(),
    userId: document.userId,
    tokenHash: document.tokenHash,
    clientType: document.clientType,
    createdAt: document.createdAt,
    lastSeenAt: document.lastSeenAt,
    expiresAt: document.expiresAt,
  };
}

export class MongoAuthSessionStore implements AuthSessionStore {
  constructor(
    @InjectModel(AuthSession.name)
    private readonly model: Model<AuthSessionDocument>,
  ) {}

  async create(input: CreateAuthSessionRecord): Promise<AuthSessionRecord> {
    const document = await this.model.create(input);
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
      .sort({ createdAt: -1, _id: -1 })
      .exec();

    return documents.map(toRecord);
  }

  async touchLastSeen(sessionId: string, lastSeenAt: Date): Promise<void> {
    if (!Types.ObjectId.isValid(sessionId)) {
      return;
    }

    await this.model
      .updateOne(
        { _id: sessionId },
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
    if (!Types.ObjectId.isValid(sessionId)) {
      return false;
    }

    const result = await this.model
      .deleteOne({
        _id: sessionId,
        userId,
      })
      .exec();

    return result.deletedCount === 1;
  }

  async revokeAllForUser(userId: string): Promise<void> {
    await this.model.deleteMany({ userId }).exec();
  }
}
