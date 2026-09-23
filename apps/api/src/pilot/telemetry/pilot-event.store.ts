import type { PilotEventRecord } from './pilot-event.types';

export const PILOT_EVENT_STORE = Symbol('PILOT_EVENT_STORE');

export type CreatePilotEventRecord = PilotEventRecord;

export interface PilotEventStore {
  create(input: CreatePilotEventRecord): Promise<void>;
}
