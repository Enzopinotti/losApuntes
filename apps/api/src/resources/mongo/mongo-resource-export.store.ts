import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import type { Model } from 'mongoose';

import type { ResourceExportStore } from '../domain/resource-export.store';
import type {
  ResourceAccountExportRecord,
  ResourceAccountExportShareCursor,
  ResourceAccountExportShareGrantRecord,
  ResourceReportAccountExportRow,
} from '../domain/resource.types';
import {
  Resource,
  ResourceReport,
  ResourceShare,
} from './resource.mongo-schemas';

@Injectable()
export class MongoResourceExportStore implements ResourceExportStore {
  constructor(
    @InjectModel(Resource.name)
    private readonly resources: Model<Resource>,
    @InjectModel(ResourceShare.name)
    private readonly shares: Model<ResourceShare>,
    @InjectModel(ResourceReport.name)
    private readonly reports: Model<ResourceReport>,
  ) {}

  async listAuthoredResourcesForExport(
    input: Parameters<ResourceExportStore['listAuthoredResourcesForExport']>[0],
  ): ReturnType<ResourceExportStore['listAuthoredResourcesForExport']> {
    const rows = await this.resources
      .find({
        authorUserId: input.authorUserId,
        ...(input.afterId ? { id: { $gt: input.afterId } } : {}),
      })
      .select({
        _id: 0,
        id: 1,
        title: 1,
        description: 1,
        tags: 1,
        subjectId: 1,
        courseOfferingId: 1,
        visibility: 1,
        moderationState: 1,
        revision: 1,
        createdAt: 1,
        updatedAt: 1,
      })
      .sort({ id: 1 })
      .limit(input.limit + 1)
      .lean<ResourceAccountExportRecord[]>()
      .exec();

    return {
      items: rows.slice(0, input.limit),
      hasMore: rows.length > input.limit,
    };
  }

  async listSubmittedReportsForExport(
    input: Parameters<ResourceExportStore['listSubmittedReportsForExport']>[0],
  ): ReturnType<ResourceExportStore['listSubmittedReportsForExport']> {
    const rows = await this.reports
      .find({
        reporterUserId: input.reporterUserId,
        ...(input.afterId ? { id: { $gt: input.afterId } } : {}),
      })
      .select({
        _id: 0,
        id: 1,
        resourceId: 1,
        reason: 1,
        details: 1,
        createdAt: 1,
      })
      .sort({ id: 1 })
      .limit(input.limit + 1)
      .lean<ResourceReportAccountExportRow[]>()
      .exec();

    return {
      items: rows.slice(0, input.limit),
      hasMore: rows.length > input.limit,
    };
  }

  async listAuthoredResourceShareGrantsForExport(
    input: Parameters<
      ResourceExportStore['listAuthoredResourceShareGrantsForExport']
    >[0],
  ): ReturnType<
    ResourceExportStore['listAuthoredResourceShareGrantsForExport']
  > {
    const resources = await this.resources
      .find({
        authorUserId: input.authorUserId,
        ...(input.after
          ? {
              id: {
                [input.after.granteeUserId ? '$gte' : '$gt']:
                  input.after.resourceId,
              },
            }
          : {}),
      })
      .select({ _id: 0, id: 1 })
      .sort({ id: 1 })
      .limit(input.limit + 1)
      .lean<Array<{ id: string }>>()
      .exec();

    const resourceIds = resources
      .slice(0, input.limit)
      .map((resource) => resource.id);
    if (resourceIds.length === 0) {
      return { items: [], nextCursor: null };
    }

    const shareRows = await this.shares
      .find({
        resourceId: { $in: resourceIds },
        ...(input.after?.granteeUserId
          ? {
              $or: [
                {
                  resourceId: input.after.resourceId,
                  userId: { $gt: input.after.granteeUserId },
                },
                { resourceId: { $gt: input.after.resourceId } },
              ],
            }
          : {}),
      })
      .select({ _id: 0, resourceId: 1, userId: 1, createdAt: 1 })
      .sort({ resourceId: 1, userId: 1 })
      .limit(input.limit + 1)
      .lean<Array<{ resourceId: string; userId: string; createdAt: Date }>>()
      .exec();

    const items: ResourceAccountExportShareGrantRecord[] = shareRows
      .slice(0, input.limit)
      .map((row) => ({
        resourceId: row.resourceId,
        granteeUserId: row.userId,
        grantedAt: row.createdAt,
      }));

    let nextCursor: ResourceAccountExportShareCursor | null = null;
    if (shareRows.length > input.limit) {
      const last = items.at(-1);
      if (last) {
        nextCursor = {
          resourceId: last.resourceId,
          granteeUserId: last.granteeUserId,
        };
      }
    } else if (resources.length > input.limit) {
      const lastScannedResourceId = resourceIds.at(-1);
      if (lastScannedResourceId) {
        nextCursor = { resourceId: lastScannedResourceId };
      }
    }

    return { items, nextCursor };
  }
}
