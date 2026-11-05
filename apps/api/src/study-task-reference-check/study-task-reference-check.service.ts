import {
  HttpException,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import type { Model } from 'mongoose';

import { QaService } from '../qa/domain/qa.service';
import { ResourceService } from '../resources/domain/resource.service';
import {
  parseStudyProgressPlan,
  type StudyProgressTask,
} from '../study-progress/domain/study-progress.plan';
import { StudyProgress } from '../study-progress/mongo/study-progress.schema';

export const STUDY_TASK_REFERENCE_MAX_CHECKS = 24;
export const STUDY_TASK_REFERENCE_CONCURRENCY = 4;
const DB_MAX_TIME_MS = 5000;
const UUID_V4 =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u;

interface StudyProgressRow {
  ownerUserId: unknown;
  subjectId: unknown;
  revision: unknown;
  plan: unknown;
}

export interface StudyTaskReferenceStatus {
  kind: 'resource' | 'question';
  id: string;
  status: 'available' | 'unavailable';
}

export interface StudyTaskReferenceCheck {
  subjectId: string;
  revision: number;
  checked: number;
  available: number;
  unavailable: number;
  items: StudyTaskReferenceStatus[];
}

function storedPlanUnavailable(): never {
  throw new ServiceUnavailableException({
    code: 'STUDY_TASK_REFERENCES_DATA_UNAVAILABLE',
    message: 'Saved study task references are temporarily unavailable',
  });
}

function isInaccessible(error: unknown): boolean {
  return (
    error instanceof HttpException &&
    [403, 404, 410].includes(error.getStatus())
  );
}

@Injectable()
export class StudyTaskReferenceCheckService {
  constructor(
    @InjectModel(StudyProgress.name)
    private readonly progress: Model<StudyProgress>,
    private readonly resources: ResourceService,
    private readonly qa: QaService,
  ) {}

  private async checkOne(
    viewerUserId: string,
    task: StudyProgressTask,
  ): Promise<StudyTaskReferenceStatus> {
    try {
      // Route-level canonical reads are the authority: in particular,
      // resources may be private, shared, revoked or have missing assets.
      if (task.kind === 'resource') {
        await this.resources.get(task.id, viewerUserId);
      } else {
        await this.qa.get(task.id, viewerUserId);
      }
      return { kind: task.kind, id: task.id, status: 'available' };
    } catch (error) {
      if (!isInaccessible(error)) throw error;
      // Never expose whether a task was deleted, moderated or unshared.
      return { kind: task.kind, id: task.id, status: 'unavailable' };
    }
  }

  async forOwner(
    ownerUserId: string,
    subjectId: string,
  ): Promise<StudyTaskReferenceCheck> {
    const record = await this.progress
      .findOne({ ownerUserId, subjectId: subjectId.toLowerCase() })
      .select({ _id: 0, ownerUserId: 1, subjectId: 1, revision: 1, plan: 1 })
      .maxTimeMS(DB_MAX_TIME_MS)
      .lean<StudyProgressRow | null>()
      .exec();

    if (!record) {
      throw new NotFoundException({
        code: 'STUDY_PROGRESS_NOT_FOUND',
        message: 'No saved progress for this subject',
      });
    }
    if (
      record.ownerUserId !== ownerUserId ||
      typeof record.subjectId !== 'string' ||
      !UUID_V4.test(record.subjectId) ||
      record.subjectId !== subjectId.toLowerCase() ||
      typeof record.revision !== 'number' ||
      !Number.isSafeInteger(record.revision) ||
      record.revision < 1
    ) {
      storedPlanUnavailable();
    }

    let plan: ReturnType<typeof parseStudyProgressPlan>;
    try {
      plan = parseStudyProgressPlan(record.plan, record.subjectId);
    } catch {
      storedPlanUnavailable();
    }

    const pending = plan.tasks.filter((task) => !task.done);
    if (pending.length > STUDY_TASK_REFERENCE_MAX_CHECKS) {
      storedPlanUnavailable();
    }

    const items: StudyTaskReferenceStatus[] = [];
    for (
      let start = 0;
      start < pending.length;
      start += STUDY_TASK_REFERENCE_CONCURRENCY
    ) {
      const group = pending.slice(
        start,
        start + STUDY_TASK_REFERENCE_CONCURRENCY,
      );
      // Bounded concurrency avoids unbounded per-request fanout.
      const checked = await Promise.all(
        group.map((task) => this.checkOne(ownerUserId, task)),
      );
      items.push(...checked);
    }

    const available = items.filter(
      (item) => item.status === 'available',
    ).length;
    return {
      subjectId: record.subjectId,
      revision: record.revision,
      checked: items.length,
      available,
      unavailable: items.length - available,
      items,
    };
  }
}
