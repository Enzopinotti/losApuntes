import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import type { Model } from 'mongoose';

import type { AbuseControlStore } from '../domain/abuse-control.store';
import type { AbuseRateWindowRecord } from '../domain/abuse-control.types';
import { AbuseRateWindow } from './abuse-rate-window.schema';

function duplicateKey(error: unknown): boolean {
  if (typeof error !== 'object' || error === null || !('code' in error)) {
    return false;
  }

  return error.code === 11000;
}

@Injectable()
export class MongoAbuseControlStore implements AbuseControlStore {
  constructor(
    @InjectModel(AbuseRateWindow.name)
    private readonly windows: Model<AbuseRateWindow>,
  ) {}

  async consume(input: {
    key: string;
    scope: string;
    windowStartedAt: Date;
    expiresAt: Date;
  }): Promise<AbuseRateWindowRecord> {
    try {
      const row = await this.windows
        .findOneAndUpdate(
          { key: input.key },
          {
            $inc: { count: 1 },
            $setOnInsert: {
              key: input.key,
              scope: input.scope,
              windowStartedAt: input.windowStartedAt,
              expiresAt: input.expiresAt,
            },
          },
          { upsert: true, new: true },
        )
        .lean<AbuseRateWindowRecord>()
        .exec();

      if (!row) throw new Error('Abuse-control consume returned no row');
      return row;
    } catch (error) {
      if (!duplicateKey(error)) throw error;

      const row = await this.windows
        .findOneAndUpdate(
          { key: input.key },
          { $inc: { count: 1 } },
          { new: true },
        )
        .lean<AbuseRateWindowRecord>()
        .exec();

      if (!row) {
        throw new Error('Abuse-control concurrent consume lost its window');
      }

      return row;
    }
  }
}
