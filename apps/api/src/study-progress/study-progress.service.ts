import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
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
