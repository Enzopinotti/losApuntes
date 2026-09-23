import { Inject, Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';

import {
  PILOT_EVENT_STORE,
  type PilotEventStore,
} from './pilot-event.store';
import type { PilotEventName } from './pilot-event.types';

@Injectable()
export class PilotEventService {
  constructor(
    @Inject(PILOT_EVENT_STORE)
    private readonly store: PilotEventStore,
  ) {}

  async record(input: {
    event: PilotEventName;
    userId?: string;
    subjectId?: string;
    resultCount?: number;
    now?: Date;
  }): Promise<void> {
    await this.store.create({
      id: randomUUID(),
      event: input.event,
      ...(input.userId ? { userId: input.userId } : {}),
      ...(input.subjectId ? { subjectId: input.subjectId } : {}),
      ...(input.resultCount === undefined
        ? {}
        : { resultCount: input.resultCount }),
      createdAt: input.now ?? new Date(),
    });
  }
}
