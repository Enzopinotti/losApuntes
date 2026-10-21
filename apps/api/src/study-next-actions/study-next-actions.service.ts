import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import type { Model } from 'mongoose';

import {
  parseStudyProgressPlan,
  type StudyProgressTask,
} from '../study-progress/domain/study-progress.plan';
import { StudyProgress } from '../study-progress/mongo/study-progress.schema';

export const STUDY_NEXT_ACTION_SUBJECT_LIMIT = 16;
const QUERY_MAX_TIME_MS = 5000;
const UUID_V4 =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/u;

interface StoredProgressRow {
  ownerUserId: unknown;
  subjectId: unknown;
  revision: unknown;
  updatedAt: unknown;
  plan: unknown;
}

export interface StudyNextAction {
  subjectId: string;
  revision: number;
  title: string;
  startsAtLocal: string | null;
  updatedAt: string;
  pendingTasks: number;
  remainingMinutes: number;
  nextTask: Pick<StudyProgressTask, 'kind' | 'id' | 'minutes'>;
}

export interface StudyNextActions {
  items: StudyNextAction[];
  summary: {
    totalPlans: number;
    actionablePlans: number;
    completedPlans: number;
    emptyPlans: number;
  };
}

function invalidStoredProgress(): never {
  throw new ServiceUnavailableException({
    code: 'STUDY_NEXT_ACTIONS_DATA_UNAVAILABLE',
    message: 'Saved next study actions are temporarily unavailable',
  });
}

function projectPlan(
  ownerUserId: string,
  row: StoredProgressRow,
): {
  state: 'actionable' | 'completed' | 'empty';
  action: StudyNextAction | null;
} {
  if (
    !row ||
    typeof row !== 'object' ||
    row.ownerUserId !== ownerUserId ||
    typeof row.subjectId !== 'string' ||
    !UUID_V4.test(row.subjectId) ||
    !Number.isSafeInteger(row.revision) ||
    typeof row.revision !== 'number' ||
    row.revision < 1 ||
    !(row.updatedAt instanceof Date) ||
    !Number.isFinite(row.updatedAt.getTime())
  ) {
    invalidStoredProgress();
  }

  let plan: ReturnType<typeof parseStudyProgressPlan>;
  try {
    plan = parseStudyProgressPlan(row.plan, row.subjectId);
  } catch {
    invalidStoredProgress();
  }

  if (plan.tasks.length === 0) return { state: 'empty', action: null };

  let pendingTasks = 0;
  let remainingMinutes = 0;
  let nextTask: StudyNextAction['nextTask'] | null = null;
  for (const task of plan.tasks) {
    if (!task.done) {
      pendingTasks++;
      remainingMinutes += task.minutes;
      if (nextTask === null) {
        // Stored task order is the student's own plan priority.
        nextTask = { kind: task.kind, id: task.id, minutes: task.minutes };
      }
    }
  }

  if (nextTask === null) return { state: 'completed', action: null };

  return {
    state: 'actionable',
    action: {
      subjectId: row.subjectId,
      revision: row.revision,
      title: plan.title,
      startsAtLocal: plan.startsAt,
      updatedAt: row.updatedAt.toISOString(),
      pendingTasks,
      remainingMinutes,
      nextTask,
    },
  };
}

function compareActions(a: StudyNextAction, b: StudyNextAction): number {
  if (a.startsAtLocal !== null && b.startsAtLocal === null) return -1;
  if (a.startsAtLocal === null && b.startsAtLocal !== null) return 1;
  if (a.startsAtLocal !== null && b.startsAtLocal !== null) {
    const compare = a.startsAtLocal.localeCompare(b.startsAtLocal);
    if (compare !== 0) return compare;
  } else {
    const compare = b.updatedAt.localeCompare(a.updatedAt);
    if (compare !== 0) return compare;
  }
  return a.subjectId.localeCompare(b.subjectId);
}

@Injectable()
export class StudyNextActionsService {
  constructor(
    @InjectModel(StudyProgress.name)
    private readonly progress: Model<StudyProgress>,
  ) {}

  async forOwner(ownerUserId: string): Promise<StudyNextActions> {
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
      .limit(STUDY_NEXT_ACTION_SUBJECT_LIMIT + 1)
      .maxTimeMS(QUERY_MAX_TIME_MS)
      .lean<StoredProgressRow[]>()
      .exec();

    if (!Array.isArray(rows) || rows.length > STUDY_NEXT_ACTION_SUBJECT_LIMIT) {
      invalidStoredProgress();
    }

    const subjects = new Set<string>();
    const items: StudyNextAction[] = [];
    let completedPlans = 0;
    let emptyPlans = 0;

    for (const row of rows) {
      const projected = projectPlan(ownerUserId, row);
      if (
        typeof row.subjectId !== 'string' ||
        subjects.has(row.subjectId)
      ) {
        invalidStoredProgress();
      }
      subjects.add(row.subjectId);

      if (projected.state === 'completed') {
        completedPlans++;
      } else if (projected.state === 'empty') {
        emptyPlans++;
      } else if (projected.action !== null) {
        items.push(projected.action);
      } else {
        invalidStoredProgress();
      }
    }

    items.sort(compareActions);
    return {
      items,
      summary: {
        totalPlans: rows.length,
        actionablePlans: items.length,
        completedPlans,
        emptyPlans,
      },
    };
  }
}
