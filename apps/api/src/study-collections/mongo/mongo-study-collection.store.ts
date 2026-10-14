import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { type Model } from 'mongoose';

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
  ) {}

  async create(
    input: Parameters<StudyCollectionStore['create']>[0],
  ): Promise<StudyCollectionRecord> {
    const filter = {
      ownerUserId: input.ownerUserId,
      operationKey: input.operationKey,
    };
    try {
      const row = await this.collections
        .findOneAndUpdate(
          filter,
          {
            $setOnInsert: {
              ...input,
              resourceIds: [],
              revision: 1,
            },
          },
          { upsert: true, new: true },
        )
        .lean<StudyCollectionRecord>()
        .exec();
      if (!row) throw new Error('Study collection upsert returned no row');
      return row;
    } catch (error) {
      if (
        typeof error !== 'object' ||
        error === null ||
        !('code' in error) ||
        error.code !== 11000
      ) {
        throw error;
      }
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
    return this.collections
      .findOneAndUpdate(
        {
          id: input.id,
          ownerUserId: input.ownerUserId,
          revision: input.expectedRevision,
        },
        { $set: input.patch, $inc: { revision: 1 } },
        { new: true },
      )
      .lean<StudyCollectionRecord>()
      .exec();
  }

  async addResource(
    id: string,
    ownerUserId: string,
    resourceId: string,
  ): Promise<StudyCollectionRecord | null> {
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
        { new: true },
      )
      .lean<StudyCollectionRecord>()
      .exec();
    return updated ?? this.findOwned(id, ownerUserId);
  }

  async removeResource(
    id: string,
    ownerUserId: string,
    resourceId: string,
  ): Promise<StudyCollectionRecord | null> {
    const updated = await this.collections
      .findOneAndUpdate(
        { id, ownerUserId, resourceIds: resourceId },
        { $pull: { resourceIds: resourceId }, $inc: { revision: 1 } },
        { new: true },
      )
      .lean<StudyCollectionRecord>()
      .exec();
    return updated ?? this.findOwned(id, ownerUserId);
  }

  async deleteOwned(id: string, ownerUserId: string): Promise<boolean> {
    const result = await this.collections.deleteOne({ id, ownerUserId }).exec();
    return result.deletedCount === 1;
  }
}
