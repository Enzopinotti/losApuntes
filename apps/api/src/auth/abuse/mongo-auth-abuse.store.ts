import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import type { Model } from 'mongoose';

import type { AuthAbuseStore } from './auth-abuse.store';
import type { AuthAbuseBucketRecord } from './auth-abuse.types';
import {
  AuthAbuseBucket,
  type AuthAbuseBucketDocument,
} from './schemas/auth-abuse-bucket.schema';

function isDuplicateKeyError(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    error.code === 11000
  );
}

function toRecord(
  document: AuthAbuseBucketDocument,
): AuthAbuseBucketRecord {
  return {
    bucketKey: document.bucketKey,
    operation: document.operation,
    dimension: document.dimension,
    windowStartedAt: document.windowStartedAt,
    windowEndsAt: document.windowEndsAt,
    count: document.count,
    expiresAt: document.expiresAt,
  };
}

@Injectable()
export class MongoAuthAbuseStore implements AuthAbuseStore {
  constructor(
    @InjectModel(AuthAbuseBucket.name)
    private readonly model: Model<AuthAbuseBucketDocument>,
  ) {}

  async consume(
    input: Parameters<AuthAbuseStore['consume']>[0],
  ): Promise<AuthAbuseBucketRecord> {
    try {
      const document = await this.model
        .findOneAndUpdate(
          { bucketKey: input.bucketKey },
          {
            $setOnInsert: {
              bucketKey: input.bucketKey,
              operation: input.operation,
              dimension: input.dimension,
              windowStartedAt: input.windowStartedAt,
              windowEndsAt: input.windowEndsAt,
              expiresAt: input.expiresAt,
            },
            $inc: { count: 1 },
          },
          { upsert: true, new: true },
        )
        .exec();

      if (!document) {
        throw new Error('Auth abuse bucket upsert returned no document');
      }

      return toRecord(document);
    } catch (error) {
      if (!isDuplicateKeyError(error)) throw error;

      const winner = await this.model
        .findOneAndUpdate(
          { bucketKey: input.bucketKey },
          { $inc: { count: 1 } },
          { new: true },
        )
        .exec();

      if (!winner) {
        throw new Error('Auth abuse bucket race winner disappeared');
      }

      return toRecord(winner);
    }
  }
}
