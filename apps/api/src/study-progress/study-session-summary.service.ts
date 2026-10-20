import {
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import type { Model } from 'mongoose';

import { parseStudyProgressPlan } from './domain/study-progress.plan';
import { StudyProgress } from './mongo/study-progress.schema';

const UUID_V4 =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;

interface SummaryRow {
  ownerUserId: string;
  subjectId: string;
  revision: number;
  updatedAt: Date;
  plan: unknown;
}

function invalidStoredPlan(): never {
  throw new ServiceUnavailableException({
    code: 'STUDY_SESSION_SUMMARY_DATA_INVALID',
    message: 'Study session summary is temporarily unavailable',
  });
}

@Injectable()
export class StudySessionSummaryService {
  constructor(
    @InjectModel(StudyProgress.name)
    private readonly progress: Model<StudyProgress>,
  ) {}

  async get(ownerUserId: string, subjectId: string) {
    if (!ownerUserId || !ownerUserId.trim() || !UUID_V4.test(subjectId)) {
      throw new UnprocessableEntityException({
        code: 'STUDY_SESSION_SUMMARY_INPUT_INVALID',
        message: 'Authenticated account and subject UUID are required',
      });
    }
    const subject = subjectId.toLowerCase();
    const row = await this.progress
      .findOne({ ownerUserId, subjectId: subject })
      .select({
        _id: 0,
        ownerUserId: 1,
        subjectId: 1,
        revision: 1,
        updatedAt: 1,
        plan: 1,
      })
      .lean<SummaryRow>()
      .exec();

    if (!row) {
      throw new NotFoundException({
        code: 'STUDY_PROGRESS_NOT_FOUND',
        message: 'No saved progress for this subject',
      });
    }
    if (
      row.ownerUserId !== ownerUserId ||
      row.subjectId !== subject ||
      !Number.isSafeInteger(row.revision) ||
      row.revision < 1 ||
      !(row.updatedAt instanceof Date) ||
      !Number.isFinite(row.updatedAt.getTime())
    ) {
      return invalidStoredPlan();
    }

    // Reuse the canonical v1 Study Session parser rather than accepting an
    // arbitrary JSON object as progress. Never return the plan title, notes,
    // start time or IDs from completed tasks.
    let plan: ReturnType<typeof parseStudyProgressPlan>;
    try {
      plan = parseStudyProgressPlan(row.plan, subject);
    } catch {
      return invalidStoredPlan();
    }

    let completedTasks = 0;
    let plannedMinutes = 0;
    let completedMinutes = 0;
    let nextTask: { kind: 'question' | 'resource'; id: string; minutes: number } | null =
      null;
    for (const task of plan.tasks) {
      plannedMinutes += task.minutes;
      if (task.done) {
        completedTasks += 1;
        completedMinutes += task.minutes;
      } else if (!nextTask) {
        // The stored order is the student's own priority order, not an
        // assertion that the linked question/resource is currently readable.
        nextTask = { kind: task.kind, id: task.id, minutes: task.minutes };
      }
    }

    const totalTasks = plan.tasks.length;
    return {
      subjectId: subject,
      revision: row.revision,
      updatedAt: row.updatedAt.toISOString(),
      tasks: {
        total: totalTasks,
        completed: completedTasks,
        pending: totalTasks - completedTasks,
      },
      minutes: {
        planned: plannedMinutes,
        completed: completedMinutes,
        remaining: plannedMinutes - completedMinutes,
      },
      completionPercent:
        totalTasks === 0 ? 0 : Math.round((completedTasks / totalTasks) * 100),
      nextTask,
    };
  }
}
