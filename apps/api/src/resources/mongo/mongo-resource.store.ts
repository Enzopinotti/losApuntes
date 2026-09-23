import { Injectable } from '@nestjs/common';
import { InjectConnection, InjectModel } from '@nestjs/mongoose';
import type { Connection, FilterQuery, Model } from 'mongoose';

import type { FileAssetRecord } from '../../files/domain/file.types';
import { FileAsset } from '../../files/mongo/file.mongo-schema';
import {
  type CreateResourceRecord,
  ResourceAssetUnavailableError,
  type ResourceStore,
  type UpdateResourceRecord,
} from '../domain/resource.store';
import type {
  ResourceRecord,
  ResourceReportRecord,
  ResourceSearchCursor,
  ResourceVisibility,
} from '../domain/resource.types';
import {
  Resource,
  ResourceReport,
  ResourceSave,
  ResourceShare,
} from './resource.mongo-schemas';

function toPlain<T>(value: { toObject(): unknown } | T): T {
  if (
    typeof value === 'object' &&
    value !== null &&
    'toObject' in value &&
    typeof value.toObject === 'function'
  ) {
    return value.toObject() as T;
  }

  return value as T;
}

function escapeRegex(value: string): string {
  const specialCharacters = new Set([
    '\\',
    '^',
    '$',
    '.',
    '|',
    '?',
    '*',
    '+',
    '(',
    ')',
    '[',
    ']',
    '{',
    '}',
  ]);

  return [...value]
    .map((character) =>
      specialCharacters.has(character) ? `\\${character}` : character,
    )
    .join('');
}

@Injectable()
export class MongoResourceStore implements ResourceStore {
  constructor(
    @InjectConnection()
    private readonly connection: Connection,
    @InjectModel(Resource.name)
    private readonly resources: Model<Resource>,
    @InjectModel(ResourceShare.name)
    private readonly shares: Model<ResourceShare>,
    @InjectModel(ResourceSave.name)
    private readonly saves: Model<ResourceSave>,
    @InjectModel(ResourceReport.name)
    private readonly reports: Model<ResourceReport>,
    @InjectModel(FileAsset.name)
    private readonly assets: Model<FileAsset>,
  ) {}

  async createClaimingAsset(input: {
    resource: CreateResourceRecord;
    actorUserId: string;
    now: Date;
  }): Promise<{ resource: ResourceRecord; asset: FileAssetRecord }> {
    const session = await this.connection.startSession();

    try {
      let output:
        { resource: ResourceRecord; asset: FileAssetRecord } | undefined;

      await session.withTransaction(async () => {
        const asset = await this.assets
          .findOneAndUpdate(
            {
              id: input.resource.assetId,
              creatorUserId: input.actorUserId,
              state: 'ready',
              claimRef: null,
              expiresAt: { $gt: input.now },
            },
            {
              $set: {
                claimRef: `resource:${input.resource.id}`,
                claimedAt: input.now,
              },
              $unset: { expiresAt: 1 },
            },
            { new: true, session },
          )
          .lean<FileAssetRecord>()
          .exec();

        if (!asset) throw new ResourceAssetUnavailableError();

        const created = await this.resources.create([input.resource], {
          session,
        });
        const resource = created[0];
        if (!resource) throw new Error('Resource creation returned no row');

        output = {
          resource: toPlain<ResourceRecord>(resource),
          asset,
        };
      });

      if (!output) throw new Error('Resource transaction produced no output');
      return output;
    } finally {
      await session.endSession();
    }
  }

  async findById(id: string): Promise<ResourceRecord | null> {
    return this.resources.findOne({ id }).lean<ResourceRecord>().exec();
  }

  async findManyByIds(ids: string[]): Promise<ResourceRecord[]> {
    if (ids.length === 0) return [];

    return this.resources
      .find({ id: { $in: ids } })
      .lean<ResourceRecord[]>()
      .exec();
  }

  async updateOwned(
    id: string,
    authorUserId: string,
    expectedRevision: number,
    patch: UpdateResourceRecord,
  ): Promise<ResourceRecord | null> {
    if (patch.visibility === undefined || patch.visibility === 'shared') {
      return this.resources
        .findOneAndUpdate(
          { id, authorUserId, revision: expectedRevision },
          { $set: patch, $inc: { revision: 1 } },
          { new: true },
        )
        .lean<ResourceRecord>()
        .exec();
    }

    const session = await this.connection.startSession();

    try {
      let updated: ResourceRecord | null = null;

      await session.withTransaction(async () => {
        updated = await this.resources
          .findOneAndUpdate(
            { id, authorUserId, revision: expectedRevision },
            { $set: patch, $inc: { revision: 1 } },
            { new: true, session },
          )
          .lean<ResourceRecord>()
          .exec();

        if (!updated) return;

        await this.shares.deleteMany({ resourceId: id }, { session }).exec();
      });

      return updated;
    } finally {
      await session.endSession();
    }
  }

  async hasShare(resourceId: string, userId: string): Promise<boolean> {
    return Boolean(await this.shares.exists({ resourceId, userId }));
  }

  async upsertShare(resourceId: string, userId: string): Promise<void> {
    await this.shares
      .updateOne(
        { resourceId, userId },
        { $setOnInsert: { resourceId, userId } },
        { upsert: true },
      )
      .exec();
  }

  async removeShare(resourceId: string, userId: string): Promise<void> {
    await this.shares.deleteOne({ resourceId, userId }).exec();
  }

  async upsertSave(resourceId: string, userId: string): Promise<void> {
    await this.saves
      .updateOne(
        { resourceId, userId },
        { $setOnInsert: { resourceId, userId } },
        { upsert: true },
      )
      .exec();
  }

  async removeSave(resourceId: string, userId: string): Promise<void> {
    await this.saves.deleteOne({ resourceId, userId }).exec();
  }

  async listSavedResourceIds(userId: string, limit: number): Promise<string[]> {
    const rows = await this.saves
      .find({ userId })
      .sort({ createdAt: -1, resourceId: 1 })
      .limit(limit)
      .lean<Array<{ resourceId: string }>>()
      .exec();

    return rows.map((row) => row.resourceId);
  }

  async searchAuthorized(input: {
    viewerUserId?: string;
    q?: string;
    subjectId?: string;
    visibility?: ResourceVisibility;
    limit: number;
    after?: ResourceSearchCursor;
  }): Promise<{ items: ResourceRecord[]; hasMore: boolean }> {
    const filters: FilterQuery<Resource>[] = [{ moderationState: 'available' }];

    if (input.subjectId) filters.push({ subjectId: input.subjectId });
    if (input.visibility) filters.push({ visibility: input.visibility });
    if (input.q) {
      filters.push({
        searchText: {
          $regex: escapeRegex(input.q),
          $options: 'i',
        },
      });
    }

    if (input.after) {
      filters.push({
        $or: [
          { updatedAt: { $lt: input.after.updatedAt } },
          {
            updatedAt: input.after.updatedAt,
            id: { $gt: input.after.id },
          },
        ],
      });
    }

    if (!input.viewerUserId) {
      filters.push({ visibility: 'public' });
      const rows = await this.resources
        .find({ $and: filters })
        .sort({ updatedAt: -1, id: 1 })
        .limit(input.limit + 1)
        .lean<ResourceRecord[]>()
        .exec();

      return {
        items: rows.slice(0, input.limit),
        hasMore: rows.length > input.limit,
      };
    }

    const rows = await this.resources
      .aggregate<ResourceRecord>([
        { $match: { $and: filters } },
        {
          $lookup: {
            from: 'resource_shares',
            let: { resourceId: '$id' },
            pipeline: [
              {
                $match: {
                  $expr: {
                    $and: [
                      { $eq: ['$resourceId', '$$resourceId'] },
                      { $eq: ['$userId', input.viewerUserId] },
                    ],
                  },
                },
              },
              { $limit: 1 },
            ],
            as: '__viewerShares',
          },
        },
        {
          $match: {
            $or: [
              { visibility: 'public' },
              { authorUserId: input.viewerUserId },
              {
                $and: [
                  { visibility: 'shared' },
                  { '__viewerShares.0': { $exists: true } },
                ],
              },
            ],
          },
        },
        { $sort: { updatedAt: -1, id: 1 } },
        { $limit: input.limit + 1 },
        { $project: { __viewerShares: 0 } },
      ])
      .exec();

    return {
      items: rows.slice(0, input.limit),
      hasMore: rows.length > input.limit,
    };
  }

  async upsertPendingReport(input: {
    id: string;
    resourceId: string;
    reporterUserId: string;
    reason: ResourceReportRecord['reason'];
    details: string | null;
  }): Promise<ResourceReportRecord> {
    const record = await this.reports
      .findOneAndUpdate(
        {
          resourceId: input.resourceId,
          reporterUserId: input.reporterUserId,
          status: 'pending',
        },
        {
          $setOnInsert: {
            ...input,
            status: 'pending',
          },
        },
        { upsert: true, new: true },
      )
      .lean<ResourceReportRecord>()
      .exec();

    if (!record) throw new Error('Resource report upsert returned no row');
    return record;
  }
}
