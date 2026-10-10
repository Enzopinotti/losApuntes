import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import type { Model } from 'mongoose';

import type { ResourceExportStore } from '../domain/resource-export.store';
import type { ResourceAccountExportRecord } from '../domain/resource.types';
import { Resource } from './resource.mongo-schemas';

@Injectable()
export class MongoResourceExportStore implements ResourceExportStore {
  constructor(
    @InjectModel(Resource.name)
    private readonly resources: Model<Resource>,
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
}
