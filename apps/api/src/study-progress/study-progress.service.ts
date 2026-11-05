import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { InjectConnection, InjectModel } from '@nestjs/mongoose';
import type { ClientSession, Connection, Model } from 'mongoose';

import { User } from '../users/schemas/user.schema';
import { parseStudyProgressPlan } from './domain/study-progress.plan';
import { StudyProgress } from './mongo/study-progress.schema';

function conflict(): never {
  throw new ConflictException({
    code: 'STUDY_PROGRESS_REVISION_CONFLICT',
    message: 'Progress was updated in another session. Reload before saving.',
  });
}
function missing(): never {
  throw new NotFoundException({
    code: 'STUDY_PROGRESS_NOT_FOUND',
    message: 'No saved progress for this subject',
  });
}
function duplicate(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    error.code === 11000
  );
}

// B143: the overview intentionally carries no student-authored plan fields.
// Use the existing unique owner+subject index for deterministic bounded reads.
const STUDY_PROGRESS_INDEX_LIMIT = 16;
const SUBJECT_UUID_V4 =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u;

function unavailableIndex(): never {
  throw new ServiceUnavailableException({
    code: 'STUDY_PROGRESS_INDEX_UNAVAILABLE',
    message: 'Saved study subjects could not be listed safely',
  });
}

@Injectable()
export class StudyProgressService {
  constructor(
    @InjectModel(StudyProgress.name)
    private readonly progress: Model<StudyProgress>,
    @InjectModel(User.name) private readonly users: Model<User>,
    @InjectConnection() private readonly connection: Connection,
  ) {}

  private async mutateActive<T>(
    ownerUserId: string,
    action: (session: ClientSession) => Promise<T>,
  ): Promise<T> {
    const session = await this.connection.startSession();
    let committed = false;
    let value: T | undefined;
    try {
      await session.withTransaction(async () => {
        // Shared write fence with closeAccount() and private collections.
        const active = await this.users
          .findOneAndUpdate(
            {
              _id: ownerUserId,
              $or: [
                { account_status: 'active' },
                { account_status: { $exists: false } },
              ],
            },
            { $inc: { account_lifecycle_revision: 1 } },
            { session, new: false },
          )
          .lean()
          .exec();
        if (!active) {
          throw new ForbiddenException({
            code: 'STUDY_PROGRESS_ACCOUNT_INACTIVE',
            message: 'Account is not active',
          });
        }
        value = await action(session);
        committed = true;
      });
      if (!committed)
        throw new Error('Study progress transaction did not commit');
      return value as T;
    } finally {
      await session.endSession();
    }
  }

  private present(record: StudyProgress) {
    return {
      plan: record.plan,
      revision: record.revision,
      updatedAt: record.updatedAt,
    };
  }

  /**
   * Private metadata-only overview. No plan, notes, title or owner identifier
   * is serialized. GET /study-progress/:subjectId remains the sole plan read.
   */
  async list(ownerUserId: string) {
    if (typeof ownerUserId !== 'string' || !ownerUserId.trim()) {
      return unavailableIndex();
    }
    const rows = await this.progress
      .find({ ownerUserId })
      .select({ _id: 0, subjectId: 1, revision: 1, updatedAt: 1 })
      .sort({ subjectId: 1 })
      .limit(STUDY_PROGRESS_INDEX_LIMIT + 1)
      .lean<Pick<StudyProgress, 'subjectId' | 'revision' | 'updatedAt'>[]>()
      .exec();
    if (rows.length > STUDY_PROGRESS_INDEX_LIMIT) return unavailableIndex();
    const items = rows.map((row) => {
      if (
        !row ||
        typeof row.subjectId !== 'string' ||
        !SUBJECT_UUID_V4.test(row.subjectId) ||
        !Number.isSafeInteger(row.revision) ||
        row.revision < 1 ||
        row.revision > 2_147_483_647 ||
        !(row.updatedAt instanceof Date) ||
        !Number.isFinite(row.updatedAt.getTime())
      ) {
        return unavailableIndex();
      }
      return {
        subjectId: row.subjectId,
        revision: row.revision,
        updatedAt: row.updatedAt.toISOString(),
      };
    });
    return { items };
  }

  async get(ownerUserId: string, subjectId: string) {
    const record = await this.progress
      .findOne({ ownerUserId, subjectId: subjectId.toLowerCase() })
      .lean<StudyProgress>()
      .exec();
    if (!record) return missing();
    return { progress: this.present(record) };
  }

  async save(
    ownerUserId: string,
    subjectId: string,
    expectedRevision: number,
    rawPlan: unknown,
  ) {
    const subject = subjectId.toLowerCase();
    const plan = parseStudyProgressPlan(rawPlan, subject);
    try {
      const record = await this.mutateActive(ownerUserId, async (session) => {
        if (expectedRevision === 0) {
          const exists = await this.progress
            .findOne({ ownerUserId, subjectId: subject })
            .session(session)
            .select({ revision: 1 })
            .lean()
            .exec();
          if (exists) return conflict();
          // The User lifecycle write fence serializes owner mutations. This
          // bounds storage even if a client submits arbitrary subject UUIDs.
          const slots = await this.progress
            .countDocuments({ ownerUserId })
            .session(session)
            .exec();
          if (slots >= 16) {
            throw new UnprocessableEntityException({
              code: 'STUDY_PROGRESS_LIMIT_REACHED',
              message: 'Maximum 16 saved subjects per account',
            });
          }
          // Unique owner+subject key makes first-write race safe. A replay
          // of revision zero must conflict, never overwrite another device.
          const created = await this.progress
            .findOneAndUpdate(
              { ownerUserId, subjectId: subject, revision: 0 },
              {
                $setOnInsert: {
                  ownerUserId,
                  subjectId: subject,
                  plan,
                  revision: 1,
                },
              },
              { upsert: true, new: true, session },
            )
            .lean<StudyProgress>()
            .exec();
          if (!created || created.revision !== 1) return conflict();
          return created;
        }
        const updated = await this.progress
          .findOneAndUpdate(
            { ownerUserId, subjectId: subject, revision: expectedRevision },
            { $set: { plan }, $inc: { revision: 1 } },
            { new: true, session },
          )
          .lean<StudyProgress>()
          .exec();
        if (!updated) return conflict();
        return updated;
      });
      return { progress: this.present(record) };
    } catch (error) {
      if (duplicate(error)) return conflict();
      throw error;
    }
  }

  async remove(
    ownerUserId: string,
    subjectId: string,
    expectedRevision: number,
  ) {
    await this.mutateActive(ownerUserId, async (session) => {
      const filter = { ownerUserId, subjectId: subjectId.toLowerCase() };
      const result = await this.progress
        .deleteOne({ ...filter, revision: expectedRevision }, { session })
        .exec();
      if (result.deletedCount === 1) return;
      const found = await this.progress
        .findOne(filter)
        .session(session)
        .select({ revision: 1 })
        .lean()
        .exec();
      if (!found) return missing();
      return conflict();
    });
    return { deleted: true as const };
  }
}
