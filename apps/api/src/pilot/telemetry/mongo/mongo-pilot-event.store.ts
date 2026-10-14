import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import type { FilterQuery, Model } from 'mongoose';

import type {
  CreatePilotEventRecord,
  PilotEventStore,
} from '../pilot-event.store';
import {
  PILOT_EVENT_ACCOUNT_EXPORT_MAX_LIMIT,
  type PilotEventAccountExportRecord,
} from '../pilot-event.types';
import { PilotEvent } from './pilot-event.mongo-schema';

@Injectable()
export class MongoPilotEventStore implements PilotEventStore {
  constructor(
    @InjectModel(PilotEvent.name)
    private readonly events: Model<PilotEvent>,
  ) {}

  async create(input: CreatePilotEventRecord): Promise<void> {
    await this.events.create(input);
  }

  async listForAccountExport(input: {
    userId: string;
    limit: number;
    after?: { createdAt: Date; id: string };
  }): Promise<{ items: PilotEventAccountExportRecord[]; hasMore: boolean }> {
    const requestedLimit = Number.isFinite(input.limit)
      ? Math.trunc(input.limit)
      : 1;
    const limit = Math.min(
      Math.max(1, requestedLimit),
      PILOT_EVENT_ACCOUNT_EXPORT_MAX_LIMIT,
    );
    const filter: FilterQuery<PilotEvent> = { userId: input.userId };

    if (input.after) {
      filter.$or = [
        { createdAt: { $gt: input.after.createdAt } },
        { createdAt: input.after.createdAt, id: { $gt: input.after.id } },
      ];
    }

    const rows = await this.events
      .find(filter)
      .select({
        _id: 0,
        id: 1,
        event: 1,
        subjectId: 1,
        resultCount: 1,
        createdAt: 1,
      })
      .sort({ createdAt: 1, id: 1 })
      .limit(limit + 1)
      .lean<PilotEventAccountExportRecord[]>()
      .exec();

    return {
      items: rows.slice(0, limit),
      hasMore: rows.length > limit,
    };
  }
}
