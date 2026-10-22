import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import type { Model } from 'mongoose';

import { parseStudyProgressPlan } from '../study-progress/domain/study-progress.plan';
import { StudyProgress } from '../study-progress/mongo/study-progress.schema';

export const STUDY_AGENDA_SUBJECT_LIMIT = 16;
const MONGO_MAX_TIME_MS = 5000;
const UUID_V4 =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u;

interface StoredStudyRow {
  ownerUserId: unknown;
  subjectId: unknown;
  revision: unknown;
  updatedAt: unknown;
  plan: unknown;
}

export interface StudyAgendaEntry {
  subjectId: string;
  revision: number;
  updatedAt: string;
  title: string;
  startsAt: string | null;
  tasks: {
    total: number;
    completed: number;
    pending: number;
  };
  minutes: {
    planned: number;
    completed: number;
    remaining: number;
  };
}

export interface StudyAgenda {
  scheduled: StudyAgendaEntry[];
  unscheduled: StudyAgendaEntry[];
}

function unavailable(): never {
  throw new ServiceUnavailableException({
    code: 'STUDY_AGENDA_DATA_UNAVAILABLE',
    message: 'Study session agenda is temporarily unavailable',
  });
}

function projectRow(
  ownerUserId: string,
  row: StoredStudyRow,
): StudyAgendaEntry {
  if (
    !row ||
    typeof row !== 'object' ||
    row.ownerUserId !== ownerUserId ||
    typeof row.subjectId !== 'string' ||
    !UUID_V4.test(row.subjectId) ||
    typeof row.revision !== 'number' ||
    !Number.isSafeInteger(row.revision) ||
    row.revision < 1 ||
    !(row.updatedAt instanceof Date) ||
    !Number.isFinite(row.updatedAt.getTime())
  ) {
    unavailable();
  }

  // Existing Study Session v1 validator is also the read boundary.
  // Stored malformed plans fail closed, never return a partial agenda.
  let plan: ReturnType<typeof parseStudyProgressPlan>;
  try {
    plan = parseStudyProgressPlan(row.plan, row.subjectId);
  } catch {
    unavailable();
  }

  let completedTasks = 0;
  let plannedMinutes = 0;
  let completedMinutes = 0;
  for (const task of plan.tasks) {
    plannedMinutes += task.minutes;
    if (task.done) {
      completedTasks += 1;
      completedMinutes += task.minutes;
    }
  }

  return {
    subjectId: row.subjectId,
    revision: row.revision,
    updatedAt: row.updatedAt.toISOString(),
    title: plan.title,
    startsAt: plan.startsAt,
    tasks: {
      total: plan.tasks.length,
      completed: completedTasks,
      pending: plan.tasks.length - completedTasks,
    },
    minutes: {
      planned: plannedMinutes,
      completed: completedMinutes,
      remaining: plannedMinutes - completedMinutes,
    },
  };
}

@Injectable()
export class StudyAgendaService {
  constructor(
    @InjectModel(StudyProgress.name)
    private readonly progress: Model<StudyProgress>,
  ) {}

  async forOwner(ownerUserId: string): Promise<StudyAgenda> {
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
      .limit(STUDY_AGENDA_SUBJECT_LIMIT + 1)
      .maxTimeMS(MONGO_MAX_TIME_MS)
      .lean<StoredStudyRow[]>()
      .exec();

    if (!Array.isArray(rows) || rows.length > STUDY_AGENDA_SUBJECT_LIMIT) {
      unavailable();
    }

    const seenSubjects = new Set<string>();
    const scheduled: StudyAgendaEntry[] = [];
    const unscheduled: StudyAgendaEntry[] = [];
    for (const row of rows) {
      const entry = projectRow(ownerUserId, row);
      if (seenSubjects.has(entry.subjectId)) {
        unavailable();
      }
      seenSubjects.add(entry.subjectId);
      if (entry.startsAt === null) {
        unscheduled.push(entry);
      } else {
        scheduled.push(entry);
      }
    }

    // The saved startsAt is a local wall-clock string without timezone.
    // Lexicographic ordering is safe, conversion to an instant is not.
    scheduled.sort(
      (a, b) =>
        (a.startsAt ?? '').localeCompare(b.startsAt ?? '') ||
        a.subjectId.localeCompare(b.subjectId),
    );
    unscheduled.sort(
      (a, b) =>
        b.updatedAt.localeCompare(a.updatedAt) ||
        a.subjectId.localeCompare(b.subjectId),
    );
    return { scheduled, unscheduled };
  }
}
