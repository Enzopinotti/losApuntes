import {
  Inject,
  Injectable,
  Logger,
  UnprocessableEntityException,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';

import { PILOT_EVENT_STORE, type PilotEventStore } from './pilot-event.store';
import {
  PILOT_EVENT_ACCOUNT_EXPORT_MAX_LIMIT,
  type PilotEventAccountExportCursor,
  type PilotEventAccountExportRecord,
  type PilotEventName,
} from './pilot-event.types';

function encodeAccountExportCursor(
  cursor: PilotEventAccountExportCursor,
): string {
  return Buffer.from(
    JSON.stringify({
      section: 'pilot.activity',
      version: 1,
      createdAt: cursor.createdAt.toISOString(),
      id: cursor.id,
    }),
    'utf8',
  ).toString('base64url');
}

function decodeAccountExportCursor(
  value: string | null,
): PilotEventAccountExportCursor | undefined {
  if (value === null) return undefined;

  try {
    if (
      value.length === 0 ||
      value.length > 512 ||
      !/^[A-Za-z0-9_-]+$/u.test(value)
    ) {
      throw new Error('invalid cursor encoding');
    }

    const decoded = Buffer.from(value, 'base64url');
    if (decoded.toString('base64url') !== value) {
      throw new Error('noncanonical cursor encoding');
    }

    const parsed: unknown = JSON.parse(decoded.toString('utf8'));
    if (
      typeof parsed !== 'object' ||
      parsed === null ||
      Array.isArray(parsed)
    ) {
      throw new Error('invalid cursor payload');
    }

    const cursor = parsed as Record<string, unknown>;
    const keys = Object.keys(cursor);
    if (
      keys.length !== 4 ||
      !keys.includes('section') ||
      !keys.includes('version') ||
      !keys.includes('createdAt') ||
      !keys.includes('id') ||
      cursor.section !== 'pilot.activity' ||
      cursor.version !== 1 ||
      typeof cursor.createdAt !== 'string' ||
      typeof cursor.id !== 'string' ||
      cursor.id.length === 0 ||
      cursor.id.length > 128
    ) {
      throw new Error('invalid cursor fields');
    }

    const createdAt = new Date(cursor.createdAt);
    if (
      Number.isNaN(createdAt.getTime()) ||
      createdAt.toISOString() !== cursor.createdAt
    ) {
      throw new Error('invalid cursor timestamp');
    }

    return { createdAt, id: cursor.id };
  } catch {
    throw new UnprocessableEntityException({
      code: 'PILOT_EVENT_ACCOUNT_EXPORT_CURSOR_INVALID',
      message: 'Pilot activity export cursor is invalid',
    });
  }
}

function assertAccountExportLimit(limit: number): void {
  if (
    !Number.isInteger(limit) ||
    limit < 1 ||
    limit > PILOT_EVENT_ACCOUNT_EXPORT_MAX_LIMIT
  ) {
    throw new UnprocessableEntityException({
      code: 'PILOT_EVENT_ACCOUNT_EXPORT_LIMIT_INVALID',
      message: 'Pilot activity export limit is invalid',
    });
  }
}

@Injectable()
export class PilotEventService {
  private readonly logger = new Logger(PilotEventService.name);

  constructor(
    @Inject(PILOT_EVENT_STORE)
    private readonly store: PilotEventStore,
  ) {}

  async recordBestEffort(input: {
    event: PilotEventName;
    userId?: string;
    subjectId?: string;
    resultCount?: number;
    now?: Date;
  }): Promise<void> {
    try {
      await this.record(input);
    } catch (error) {
      this.logger.warn(
        `Pilot telemetry write failed for ${input.event}: ${
          error instanceof Error ? error.message : 'unknown error'
        }`,
      );
    }
  }

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

  async listForAccountExport(input: {
    userId: string;
    cursor: string | null;
    limit: number;
  }): Promise<{
    items: PilotEventAccountExportRecord[];
    nextCursor: string | null;
  }> {
    assertAccountExportLimit(input.limit);

    const page = await this.store.listForAccountExport({
      userId: input.userId,
      limit: input.limit,
      after: decodeAccountExportCursor(input.cursor),
    });
    const last = page.items.at(-1);

    return {
      items: page.items,
      nextCursor:
        page.hasMore && last
          ? encodeAccountExportCursor({
              createdAt: last.createdAt,
              id: last.id,
            })
          : null,
    };
  }
}
