import type {
  PilotEventAccountExportCursor,
  PilotEventAccountExportRecord,
  PilotEventRecord,
} from './pilot-event.types';

export const PILOT_EVENT_STORE = Symbol('PILOT_EVENT_STORE');

export type CreatePilotEventRecord = PilotEventRecord;

export interface PilotEventStore {
  create(input: CreatePilotEventRecord): Promise<void>;
  listForAccountExport(input: {
    userId: string;
    limit: number;
    after?: PilotEventAccountExportCursor;
  }): Promise<{ items: PilotEventAccountExportRecord[]; hasMore: boolean }>;
}
