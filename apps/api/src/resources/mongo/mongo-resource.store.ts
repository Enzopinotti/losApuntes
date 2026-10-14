import { Injectable } from '@nestjs/common';
import { InjectConnection, InjectModel } from '@nestjs/mongoose';
import { Types, type Connection, type FilterQuery, type Model } from 'mongoose';

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

const SAVED_ACCENT_GROUPS: Record<string, string> = {
  a: '[aáàâä]',
  á: '[aáàâä]',
  à: '[aáàâä]',
  â: '[aáàâä]',
  ä: '[aáàâä]',
  e: '[eéèêë]',
  é: '[eéèêë]',
  è: '[eéèêë]',
  ê: '[eéèêë]',
  ë: '[eéèêë]',
  i: '[iíìîï]',
  í: '[iíìîï]',
  ì: '[iíìîï]',
  î: '[iíìîï]',
  ï: '[iíìîï]',
  o: '[oóòôö]',
  ó: '[oóòôö]',
  ò: '[oóòôö]',
  ô: '[oóòôö]',
  ö: '[oóòôö]',
  u: '[uúùûü]',
  ú: '[uúùûü]',
  ù: '[uúùûü]',
  û: '[uúùûü]',
  ü: '[uúùûü]',
};

/** Existing searchText is lowercased but retains accents; do not migrate it. */
export function savedMetadataRegex(query: string): string {
  return [...query].map((character) =>
    SAVED_ACCENT_GROUPS[character] ?? escapeRegex(character),
  ).join('');
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
              scanCompletedAt: { $type: 'date' },
              scanEngine: { $type: 'string' },
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

  async listShareGrants(
    input: Parameters<ResourceStore['listShareGrants']>[0],
  ): ReturnType<ResourceStore['listShareGrants']> {
    const rows = await this.shares
      .find({
        resourceId: input.resourceId,
        ...(input.after
          ? { _id: { $gt: new Types.ObjectId(input.after.shareId) } }
          : {}),
      })
      .select({ _id: 1, userId: 1, createdAt: 1 })
      .sort({ _id: 1 })
      .limit(input.limit + 1)
      .lean<
        Array<{
          _id: Types.ObjectId;
          userId: string;
          createdAt: Date;
        }>
      >()
      .exec();

    return {
      items: rows.slice(0, input.limit).map((row) => ({
        shareId: row._id.toHexString(),
        userId: row.userId,
        createdAt: row.createdAt,
      })),
      hasMore: rows.length > input.limit,
    };
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

  async getOwnedStatistics(
    authorUserId: string,
  ): ReturnType<ResourceStore['getOwnedStatistics']> {
    type Row = {
      publications: Array<{ _id: ResourceVisibility; count: number }>;
      totals: Array<{ saves: number; shareGrants: number }>;
      topResources: Array<{
        id: string;
        title: string;
        visibility: ResourceVisibility;
        saves: number;
        shareGrants: number;
      }>;
    };

    const [row] = await this.resources
      .aggregate<Row>([
        {
          $match: {
            authorUserId,
            moderationState: 'available',
          },
        },
        {
          $lookup: {
            from: 'resource_saves',
            let: { resourceId: '$id' },
            pipeline: [
              {
                $match: {
                  $expr: { $eq: ['$resourceId', '$$resourceId'] },
                },
              },
              { $count: 'count' },
            ],
            as: 'saveCounts',
          },
        },
        {
          $lookup: {
            from: 'resource_shares',
            let: { resourceId: '$id', visibility: '$visibility' },
            pipeline: [
              {
                $match: {
                  $expr: {
                    $and: [
                      { $eq: ['$resourceId', '$$resourceId'] },
                      { $eq: ['$$visibility', 'shared'] },
                    ],
                  },
                },
              },
              { $count: 'count' },
            ],
            as: 'shareCounts',
          },
        },
        {
          $project: {
            _id: 0,
            id: 1,
            title: 1,
            visibility: 1,
            saves: {
              $ifNull: [{ $arrayElemAt: ['$saveCounts.count', 0] }, 0],
            },
            shareGrants: {
              $ifNull: [{ $arrayElemAt: ['$shareCounts.count', 0] }, 0],
            },
          },
        },
        {
          $facet: {
            publications: [
              { $group: { _id: '$visibility', count: { $sum: 1 } } },
            ],
            totals: [
              {
                $group: {
                  _id: null,
                  saves: { $sum: '$saves' },
                  shareGrants: { $sum: '$shareGrants' },
                },
              },
            ],
            topResources: [
              { $sort: { saves: -1, shareGrants: -1, id: 1 } },
              { $limit: 5 },
            ],
          },
        },
      ])
      .exec();

    const counts = {
      total: 0,
      private: 0,
      shared: 0,
      public: 0,
    };
    for (const group of row?.publications ?? []) {
      if (group._id === 'private' ||
          group._id === 'shared' ||
          group._id === 'public') {
        counts[group._id] = group.count;
        counts.total += group.count;
      }
    }

    return {
      publications: counts,
      currentSaves: row?.totals[0]?.saves ?? 0,
      activeShareGrants: row?.totals[0]?.shareGrants ?? 0,
      topResources: row?.topResources ?? [],
    };
  }

  async listOwnedSubjects(
    authorUserId: string,
  ): ReturnType<ResourceStore['listOwnedSubjects']> {
    const rows = await this.resources
      .aggregate<{ subjectId: string; count: number }>([
        { $match: { authorUserId, moderationState: 'available' } },
        { $group: { _id: '$subjectId', count: { $sum: 1 } } },
        { $sort: { count: -1, _id: 1 } },
        { $limit: 51 },
        { $project: { _id: 0, subjectId: '$_id', count: 1 } },
      ])
      .exec();
    return { items: rows.slice(0, 50), truncated: rows.length > 50 };
  }

  async listOwnedResources(
    input: Parameters<ResourceStore['listOwnedResources']>[0],
  ): ReturnType<ResourceStore['listOwnedResources']> {
    const rows = await this.resources
      .find({
        authorUserId: input.authorUserId,
        moderationState: 'available',
        ...(input.visibility ? { visibility: input.visibility } : {}),
        ...(input.subjectId ? { subjectId: input.subjectId } : {}),
        ...(input.q
          ? {
              searchText: {
                $regex: escapeRegex(input.q),
                $options: 'i',
              },
            }
          : {}),
        ...(input.after
          ? {
              $or: [
                {
                  createdAt: {
                    [input.order === 'oldest' ? '$gt' : '$lt']:
                      input.after.createdAt,
                  },
                },
                {
                  createdAt: input.after.createdAt,
                  id: { $gt: input.after.id },
                },
              ],
            }
          : {}),
      })
      .sort({ createdAt: input.order === 'oldest' ? 1 : -1, id: 1 })
      .limit(input.limit + 1)
      .lean<ResourceRecord[]>()
      .exec();

    return {
      items: rows.slice(0, input.limit),
      hasMore: rows.length > input.limit,
    };
  }

  async listSavedResources(
    input: Parameters<ResourceStore['listSavedResources']>[0],
  ): ReturnType<ResourceStore['listSavedResources']> {
    const rows = await this.saves
      .find({
        userId: input.userId,
        ...(input.after
          ? {
              $or: [
                { createdAt: { $lt: input.after.createdAt } },
                {
                  createdAt: input.after.createdAt,
                  resourceId: { $gt: input.after.resourceId },
                },
              ],
            }
          : {}),
      })
      .sort({ createdAt: -1, resourceId: 1 })
      .limit(input.limit + 1)
      .lean<Array<{ resourceId: string; createdAt: Date }>>()
      .exec();

    return {
      items: rows.slice(0, input.limit),
      hasMore: rows.length > input.limit,
    };
  }

  async searchSavedResources(
    input: Parameters<ResourceStore['searchSavedResources']>[0],
  ): ReturnType<ResourceStore['searchSavedResources']> {
    // Join only the saves owned by this authenticated account. Candidate
    // visibility and metadata filtering MUST happen before $limit: otherwise
    // an early page of inaccessible items hides later valid matches.
    const candidates = await this.saves
      .aggregate<{ resourceId: string; createdAt: Date }>([
        {
          $match: {
            userId: input.userId,
            ...(input.after
              ? {
                  $or: [
                    { createdAt: { $lt: input.after.createdAt } },
                    {
                      createdAt: input.after.createdAt,
                      resourceId: { $gt: input.after.resourceId },
                    },
                  ],
                }
              : {}),
          },
        },
        { $sort: { createdAt: -1, resourceId: 1 } },
        {
          $lookup: {
            from: 'resources',
            let: { savedResourceId: '$resourceId' },
            pipeline: [
              {
                $match: {
                  $expr: { $eq: ['$id', '$savedResourceId'] },
                  moderationState: 'available',
                  searchText: {
                    $regex: savedMetadataRegex(input.q),
                    $options: 'i',
                  },
                },
              },
              { $limit: 1 },
            ],
            as: '__resource',
          },
        },
        { $unwind: '$__resource' },
        {
          $lookup: {
            from: 'resource_shares',
            let: { savedResourceId: '$resourceId' },
            pipeline: [
              {
                $match: {
                  $expr: {
                    $and: [
                      { $eq: ['$resourceId', '$savedResourceId'] },
                      { $eq: ['$userId', input.userId] },
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
              { '__resource.visibility': 'public' },
              { '__resource.authorUserId': input.userId },
              {
                $and: [
                  { '__resource.visibility': 'shared' },
                  { '__viewerShares.0': { $exists: true } },
                ],
              },
            ],
          },
        },
        { $limit: input.limit + 1 },
        { $project: { _id: 0, resourceId: 1, createdAt: 1 } },
      ])
      .exec();

    return {
      items: candidates.slice(0, input.limit),
      hasMore: candidates.length > input.limit,
    };
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

  async listFeedCandidates(input: {
    viewerUserId: string;
    subjectIds?: string[];
    authorUserIds?: string[];
    anchorAt: Date;
    limit: number;
  }): Promise<ResourceRecord[]> {
    const filters: FilterQuery<Resource>[] = [
      { moderationState: 'available' },
      { createdAt: { $lte: input.anchorAt } },
      { authorUserId: { $ne: input.viewerUserId } },
    ];

    if (input.subjectIds && input.subjectIds.length > 0) {
      filters.push({ subjectId: { $in: input.subjectIds } });
    }
    if (input.authorUserIds && input.authorUserIds.length > 0) {
      filters.push({ authorUserId: { $in: input.authorUserIds } });
    }

    return this.resources
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
              {
                $and: [
                  { visibility: 'shared' },
                  { '__viewerShares.0': { $exists: true } },
                ],
              },
            ],
          },
        },
        { $sort: { createdAt: -1, id: 1 } },
        { $limit: input.limit },
        { $project: { __viewerShares: 0 } },
      ])
      .exec();
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
