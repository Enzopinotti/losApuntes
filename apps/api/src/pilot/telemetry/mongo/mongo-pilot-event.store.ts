import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import type { Model } from 'mongoose';

import type {
  CreatePilotEventRecord,
  PilotEventStore,
} from '../pilot-event.store';
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
}
