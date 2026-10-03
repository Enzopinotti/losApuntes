import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';

import {
  type AuthActionPurpose,
  type AuthActionTokenRecord,
  type AuthActionTokenStore,
  type CreateAuthActionTokenRecord,
} from './auth-action-token.types';
import {
  AuthActionToken,
  type AuthActionTokenDocument,
} from './schemas/auth-action-token.schema';

function isDuplicateKeyError(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    error.code === 11000
  );
}

function toRecord(document: AuthActionTokenDocument): AuthActionTokenRecord {
  return {
    id: document.tokenId,
    userId: document.userId,
    purpose: document.purpose,
    tokenHash: document.tokenHash,
    credentialVersion: document.credentialVersion,
    issueBucket: document.issueBucket,
    createdAt: document.createdAt,
    expiresAt: document.expiresAt,
    consumedAt: document.consumedAt,
    consumedReason: document.consumedReason ?? null,
  };
}

@Injectable()
export class MongoAuthActionTokenStore implements AuthActionTokenStore {
  constructor(
    @InjectModel(AuthActionToken.name)
    private readonly model: Model<AuthActionTokenDocument>,
  ) {}

  async createIfBucketAvailable(
    input: CreateAuthActionTokenRecord,
  ): Promise<AuthActionTokenRecord | null> {
    try {
      const document = await this.model.create({
        tokenId: input.id,
        userId: input.userId,
        purpose: input.purpose,
        tokenHash: input.tokenHash,
        credentialVersion: input.credentialVersion,
        issueBucket: input.issueBucket,
        createdAt: input.createdAt,
        expiresAt: input.expiresAt,
        consumedAt: null,
        consumedReason: null,
      });

      return toRecord(document);
    } catch (error) {
      if (isDuplicateKeyError(error)) return null;
      throw error;
    }
  }

  async findAvailableByTokenHash(
    tokenHash: string,
    purpose: AuthActionPurpose,
    now: Date,
  ): Promise<AuthActionTokenRecord | null> {
    const document = await this.model
      .findOne({
        tokenHash,
        purpose,
        consumedAt: null,
        expiresAt: { $gt: now },
      })
      .exec();

    return document ? toRecord(document) : null;
  }

  async claimAvailableByTokenHash(
    tokenHash: string,
    purpose: AuthActionPurpose,
    consumedAt: Date,
  ): Promise<AuthActionTokenRecord | null> {
    const document = await this.model
      .findOneAndUpdate(
        {
          tokenHash,
          purpose,
          consumedAt: null,
          expiresAt: { $gt: consumedAt },
        },
        {
          $set: {
            consumedAt,
            consumedReason: 'claimed',
          },
        },
        {
          new: true,
        },
      )
      .exec();

    return document ? toRecord(document) : null;
  }

  async findClaimedByTokenHash(
    tokenHash: string,
    purpose: AuthActionPurpose,
    now: Date,
  ): Promise<AuthActionTokenRecord | null> {
    const document = await this.model
      .findOne({
        tokenHash,
        purpose,
        consumedReason: 'claimed',
        expiresAt: { $gt: now },
      })
      .exec();

    return document ? toRecord(document) : null;
  }

  async findLatestActiveForUserPurpose(
    userId: string,
    purpose: AuthActionPurpose,
    now: Date,
  ): Promise<AuthActionTokenRecord | null> {
    const document = await this.model
      .findOne({
        userId,
        purpose,
        consumedAt: null,
        expiresAt: { $gt: now },
      })
      .sort({ createdAt: -1, tokenId: -1 })
      .exec();

    return document ? toRecord(document) : null;
  }

  async trimActiveForUserPurpose(
    userId: string,
    purpose: AuthActionPurpose,
    now: Date,
    keep: number,
    consumedAt: Date,
  ): Promise<void> {
    const retained = await this.model
      .find({
        userId,
        purpose,
        consumedAt: null,
        expiresAt: { $gt: now },
      })
      .sort({ createdAt: -1, tokenId: -1 })
      .limit(keep)
      .select({ tokenId: 1, createdAt: 1, _id: 0 })
      .lean<Array<{ tokenId: string; createdAt: Date }>>()
      .exec();

    if (retained.length < keep) return;

    const cutoff = retained.at(-1);
    if (!cutoff) return;

    await this.model
      .updateMany(
        {
          userId,
          purpose,
          consumedAt: null,
          expiresAt: { $gt: now },
          $or: [
            { createdAt: { $lt: cutoff.createdAt } },
            {
              createdAt: cutoff.createdAt,
              tokenId: { $lt: cutoff.tokenId },
            },
          ],
        },
        {
          $set: {
            consumedAt,
            consumedReason: 'invalidated',
          },
        },
      )
      .exec();
  }

  async invalidateByIds(
    userId: string,
    purpose: AuthActionPurpose,
    ids: string[],
    consumedAt: Date,
  ): Promise<void> {
    if (ids.length === 0) return;

    await this.model
      .updateMany(
        {
          userId,
          purpose,
          tokenId: { $in: ids },
          consumedAt: null,
        },
        {
          $set: {
            consumedAt,
            consumedReason: 'invalidated',
          },
        },
      )
      .exec();
  }

  async invalidateAllForUserPurpose(
    userId: string,
    purpose: AuthActionPurpose,
    consumedAt: Date,
  ): Promise<void> {
    await this.model
      .updateMany(
        {
          userId,
          purpose,
          consumedAt: null,
        },
        {
          $set: {
            consumedAt,
            consumedReason: 'invalidated',
          },
        },
      )
      .exec();
  }
}
