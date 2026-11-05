import {
  ConflictException,
  ForbiddenException,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';
import { InjectConnection, InjectModel } from '@nestjs/mongoose';
import type { ClientSession, Connection, Model } from 'mongoose';

import { User } from '../../users/schemas/user.schema';

import {
  STUDY_COLLECTION_MAX_ITEMS,
  type StudyCollectionRecord,
  type StudyCollectionStore,
} from '../domain/study-collection.store';
import { StudyCollection } from './study-collection.mongo-schema';

@Injectable()
export class MongoStudyCollectionStore implements StudyCollectionStore {
  constructor(
    @InjectModel(StudyCollection.name)
    private readonly collections: Model<StudyCollection>,
    @InjectConnection()
    private readonly connection: Connection,
    @InjectModel(User.name)
    private readonly users: Model<User>,
  ) {}

  /**
   * All private mutations (not just initial create) contend with the account
   * closure transaction by updating the same User lifecycle revision.
   * A closed account cannot commit any collection mutation after closure.
   * A lost race triggers Mongo's write-conflict / transaction retry semantics.
   */
  private async withActiveOwnerTransaction<T>(
    ownerUserId: string,
    mutate: (session: ClientSession) => Promise<T>,
  ): Promise<T> {
    const session = await this.connection.startSession();
    let finished = false;
    let value: T | undefined;
    try {
      await session.withTransaction(async () => {
        const activeUser = await this.users
          .findOneAndUpdate(
            {
              _id: ownerUserId,
              $or: [
                { account_status: 'active' },
                { account_status: { $exists: false } },
              ],
            },
            { $inc: { account_lifecycle_revision: 1 } },
            { new: false, session },
          )
          .lean()
          .exec();
        if (!activeUser) {
          throw new ForbiddenException({
            code: 'STUDY_COLLECTION_ACCOUNT_INACTIVE',
            message: 'Cannot change collections for a closed account',
          });
        }
        value = await mutate(session);
        finished = true;
      });
      if (!finished) {
        throw new Error('Study collection mutation transaction did not commit');
      }
      return value as T;
    } finally {
      await session.endSession();
    }
  }

  async create(
    input: Parameters<StudyCollectionStore['create']>[0],
  ): Promise<StudyCollectionRecord> {
    const filter = {
      ownerUserId: input.ownerUserId,
      operationKey: input.operationKey,
    };
    try {
      return await this.withActiveOwnerTransaction(
        input.ownerUserId,
        async (session) => {
          const created = await this.collections
            .findOneAndUpdate(
              filter,
              {
                $setOnInsert: {
                  ...input,
                  resourceIds: [],
                  revision: 1,
                },
              },
              { upsert: true, new: true, session },
            )
            .lean<StudyCollectionRecord>()
            .exec();
          if (!created)
            throw new Error('Study collection upsert returned no row');
          return created;
        },
      );
    } catch (error) {
      if (
        typeof error !== 'object' ||
        error === null ||
        !('code' in error) ||
        error.code !== 11000
      ) {
        throw error;
      }
      // Concurrent replay of the same owner+operationKey is idempotent.
      // Another unique-key collision does not silently pass this lookup.
      const existing = await this.collections
        .findOne(filter)
        .lean<StudyCollectionRecord>()
        .exec();
      if (!existing) throw error;
      return existing;
    }
  }

  async list(
    input: Parameters<StudyCollectionStore['list']>[0],
  ): ReturnType<StudyCollectionStore['list']> {
    const rows = await this.collections
      .find({
        ownerUserId: input.ownerUserId,
        ...(input.after
          ? {
              $or: [
                { createdAt: { $lt: input.after.createdAt } },
                {
                  createdAt: input.after.createdAt,
                  id: { $lt: input.after.id },
                },
              ],
            }
          : {}),
      })
      .sort({ createdAt: -1, id: -1 })
      .limit(input.limit + 1)
      .lean<StudyCollectionRecord[]>()
      .exec();
    return {
      items: rows.slice(0, input.limit),
      hasMore: rows.length > input.limit,
    };
  }

  async findOwned(
    id: string,
    ownerUserId: string,
  ): Promise<StudyCollectionRecord | null> {
    return this.collections
      .findOne({ id, ownerUserId })
      .lean<StudyCollectionRecord>()
      .exec();
  }

  async updateOwned(
    input: Parameters<StudyCollectionStore['updateOwned']>[0],
  ): Promise<StudyCollectionRecord | null> {
    return this.withActiveOwnerTransaction(input.ownerUserId, (session) =>
      this.collections
        .findOneAndUpdate(
          {
            id: input.id,
            ownerUserId: input.ownerUserId,
            revision: input.expectedRevision,
          },
          { $set: input.patch, $inc: { revision: 1 } },
          { new: true, session },
        )
        .lean<StudyCollectionRecord>()
        .exec(),
    );
  }

  async reorderResources(
    input: Parameters<StudyCollectionStore['reorderResources']>[0],
  ): Promise<StudyCollectionRecord | null> {
    const mutation = async (session: ClientSession) => {
      const updated = await this.collections
        .findOneAndUpdate(
          {
            id: input.id,
            ownerUserId: input.ownerUserId,
            revision: input.expectedRevision,
            // Protect against legacy writers that missed the revision bump.
            resourceIds: input.originalResourceIds,
          },
          {
            $set: { resourceIds: input.orderedResourceIds },
            $inc: { revision: 1 },
          },
          { new: true, session },
        )
        .lean<StudyCollectionRecord>()
        .exec();

      // Fail before committing the transaction if Mongo reports an
      // inconsistent post-write document. Account lifecycle is rolled back.
      if (
        updated &&
        (updated.id !== input.id ||
          updated.ownerUserId !== input.ownerUserId ||
          updated.revision !== input.expectedRevision + 1 ||
          !Array.isArray(updated.resourceIds) ||
          updated.resourceIds.length !== input.orderedResourceIds.length ||
          updated.resourceIds.some(
            (id, index) => id !== input.orderedResourceIds[index],
          ) ||
          !(updated.updatedAt instanceof Date) ||
          !Number.isFinite(updated.updatedAt.getTime()))
      ) {
        throw new ServiceUnavailableException({
          code: 'STUDY_COLLECTION_ORDER_DATA_INVALID',
          message: 'Collection order could not be changed safely',
        });
      }
      return updated;
    };

    return this.withActiveOwnerTransaction(input.ownerUserId, mutation);
  }

  async addResource(
    id: string,
    ownerUserId: string,
    resourceId: string,
  ): Promise<StudyCollectionRecord | null> {
    return this.withActiveOwnerTransaction(ownerUserId, async (session) => {
      const updated = await this.collections
        .findOneAndUpdate(
          {
            id,
            ownerUserId,
            resourceIds: { $ne: resourceId },
            $expr: {
              $lt: [
                { $size: { $ifNull: ['$resourceIds', []] } },
                STUDY_COLLECTION_MAX_ITEMS,
              ],
            },
          },
          {
            $addToSet: { resourceIds: resourceId },
            $inc: { revision: 1 },
          },
          { new: true, session },
        )
        .lean<StudyCollectionRecord>()
        .exec();
      return (
        updated ??
        this.collections
          .findOne({ id, ownerUserId })
          .session(session)
          .lean<StudyCollectionRecord>()
          .exec()
      );
    });
  }

  async removeResource(
    id: string,
    ownerUserId: string,
    resourceId: string,
    expectedRevision?: number,
  ): Promise<StudyCollectionRecord | null> {
    return this.withActiveOwnerTransaction(ownerUserId, async (session) => {
      const updated = await this.collections
        .findOneAndUpdate(
          {
            id,
            ownerUserId,
            resourceIds: resourceId,
            ...(expectedRevision === undefined
              ? {}
              : { revision: expectedRevision }),
          },
          { $pull: { resourceIds: resourceId }, $inc: { revision: 1 } },
          { new: true, session },
        )
        .lean<StudyCollectionRecord>()
        .exec();
      if (expectedRevision !== undefined && !updated) {
        // Do not reinterpret another writer's successful revision bump as
        // this DELETE succeeding. No optimistic match means no removal.
        throw new ConflictException({
          code: 'STUDY_COLLECTION_REVISION_CONFLICT',
          message:
            'Collection changed; inspect it again before removing a link',
        });
      }
      return (
        updated ??
        this.collections
          .findOne({ id, ownerUserId })
          .session(session)
          .lean<StudyCollectionRecord>()
          .exec()
      );
    });
  }

  async deleteOwned(id: string, ownerUserId: string): Promise<boolean> {
    return this.withActiveOwnerTransaction(ownerUserId, async (session) => {
      const result = await this.collections
        .deleteOne({ id, ownerUserId }, { session })
        .exec();
      return result.deletedCount === 1;
    });
  }
}
