import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import type { Model } from 'mongoose';

import { parseStudyProgressPlan } from '../study-progress/domain/study-progress.plan';
import { StudyProgress } from '../study-progress/mongo/study-progress.schema';
import {
  renderStudyCalendar,
  type StudyCalendarEvent,
} from './study-calendar.ics';

export const STUDY_CALENDAR_SUBJECT_LIMIT = 16;
const DB_MAX_TIME_MS = 5000;
const MAX_REVISION = 2_147_483_647;
const UUID_V4 =
  /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/u;

interface StoredPlanRow {
  ownerUserId: unknown;
  subjectId: unknown;
  revision: unknown;
  updatedAt: unknown;
  plan: unknown;
}

function invalidStoredPlan(): never {
  throw new ServiceUnavailableException({
    code: 'STUDY_CALENDAR_DATA_UNAVAILABLE',
    message: 'Study calendar is temporarily unavailable',
  });
}

function toCalendarEvent(
  row: StoredPlanRow,
  ownerUserId: string,
): StudyCalendarEvent | null {
  if (
    !row ||
    typeof row !== 'object' ||
    row.ownerUserId !== ownerUserId ||
    typeof row.subjectId !== 'string' ||
    !UUID_V4.test(row.subjectId) ||
    typeof row.revision !== 'number' ||
    !Number.isSafeInteger(row.revision) ||
    row.revision < 1 ||
    row.revision > MAX_REVISION ||
    !(row.updatedAt instanceof Date) ||
    !Number.isFinite(row.updatedAt.getTime())
  ) {
    invalidStoredPlan();
  }

  let plan: ReturnType<typeof parseStudyProgressPlan>;
  try {
    plan = parseStudyProgressPlan(row.plan, row.subjectId);
  } catch {
    invalidStoredPlan();
  }

  // Unscheduled sessions cannot be exported as timed VEVENTs.
  // A plan with no tasks has no duration: never invent one.
  if (plan.startsAt === null || plan.tasks.length === 0) return null;

  const minutes = plan.tasks.reduce((sum, task) => sum + task.minutes, 0);
  if (!Number.isSafeInteger(minutes) || minutes < 5 || minutes > 1200) {
    invalidStoredPlan();
  }

  return {
    subjectId: row.subjectId,
    revision: row.revision,
    updatedAt: row.updatedAt,
    startsAtLocal: plan.startsAt,
    minutes,
    title: plan.title,
  };
}

@Injectable()
export class StudyCalendarService {
  constructor(
    @InjectModel(StudyProgress.name)
    private readonly progress: Model<StudyProgress>,
  ) {}

  async forOwner(ownerUserId: string): Promise<string> {
    const rows = await this.progress
      .find({ ownerUserId })
      .select({
        _id: 0,
        ownerUserId: 1,
        subjectId: 1,
        revision: 1,
        updatedAt: 1,
        plan: 1,
      })
      .limit(STUDY_CALENDAR_SUBJECT_LIMIT + 1)
      .maxTimeMS(DB_MAX_TIME_MS)
      .lean<StoredPlanRow[]>()
      .exec();

    if (!Array.isArray(rows) || rows.length > STUDY_CALENDAR_SUBJECT_LIMIT) {
      invalidStoredPlan();
    }

    const seen = new Set<string>();
    const events: StudyCalendarEvent[] = [];
    for (const row of rows) {
      // Validate and count all records, including unscheduled ones.
      const event = toCalendarEvent(row, ownerUserId);
      if (typeof row.subjectId !== 'string' || seen.has(row.subjectId)) {
        invalidStoredPlan();
      }
      seen.add(row.subjectId);
      if (event) events.push(event);
    }

    events.sort(
      (a, b) =>
        a.startsAtLocal.localeCompare(b.startsAtLocal) ||
        a.subjectId.localeCompare(b.subjectId),
    );
    return renderStudyCalendar(ownerUserId, events, new Date());
  }
}
