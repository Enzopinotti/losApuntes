import { Injectable } from '@nestjs/common';
import { InjectConnection, InjectModel } from '@nestjs/mongoose';
import type { ClientSession, Connection, FilterQuery, Model } from 'mongoose';

import type {
  ManagerChangeResult,
  OrganizationStore,
  UpdateOrganizationRecord,
} from '../domain/organization.store';
import type {
  OrganizationAuditRecord,
  OrganizationCursor,
  OrganizationEventRecord,
  OrganizationFeaturedResourceRecord,
  OrganizationFollowRecord,
  OrganizationLinkRecord,
  OrganizationManagerRecord,
  OrganizationManagerRole,
  OrganizationPostRecord,
  OrganizationRecord,
  OrganizationReportRecord,
  OrganizationType,
  OrganizationVerificationState,
} from '../domain/organization.types';
import {
  Organization,
  OrganizationAudit,
  OrganizationEvent,
  OrganizationFeaturedResource,
  OrganizationFollow,
  OrganizationLink,
  OrganizationManager,
  OrganizationPost,
  OrganizationReport,
} from './organization.mongo-schemas';

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');
}

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

class ManagerMutationAbort extends Error {
  constructor(readonly result: Exclude<ManagerChangeResult, { status: 'ok' }>) {
    super(result.status);
  }
}

@Injectable()
export class MongoOrganizationStore implements OrganizationStore {
  constructor(
    @InjectConnection()
    private readonly connection: Connection,
    @InjectModel(Organization.name)
    private readonly organizations: Model<Organization>,
    @InjectModel(OrganizationManager.name)
    private readonly managers: Model<OrganizationManager>,
    @InjectModel(OrganizationAudit.name)
    private readonly audits: Model<OrganizationAudit>,
    @InjectModel(OrganizationFollow.name)
    private readonly follows: Model<OrganizationFollow>,
    @InjectModel(OrganizationPost.name)
    private readonly posts: Model<OrganizationPost>,
    @InjectModel(OrganizationEvent.name)
    private readonly events: Model<OrganizationEvent>,
    @InjectModel(OrganizationLink.name)
    private readonly links: Model<OrganizationLink>,
    @InjectModel(OrganizationFeaturedResource.name)
    private readonly featuredResources: Model<OrganizationFeaturedResource>,
    @InjectModel(OrganizationReport.name)
    private readonly reports: Model<OrganizationReport>,
  ) {}

  async createWithOwner(input: {
    organization: Omit<OrganizationRecord, 'createdAt' | 'updatedAt'>;
    ownerUserId: string;
    audit: OrganizationAuditRecord;
  }): Promise<{
    organization: OrganizationRecord;
    owner: OrganizationManagerRecord;
  }> {
    const session = await this.connection.startSession();
    try {
      let output:
        | {
            organization: OrganizationRecord;
            owner: OrganizationManagerRecord;
          }
        | undefined;

      await session.withTransaction(async () => {
        const createdOrganizations = await this.organizations.create(
          [input.organization],
          { session },
        );
        const createdManagers = await this.managers.create(
          [
            {
              organizationId: input.organization.id,
              userId: input.ownerUserId,
              role: 'owner',
            },
          ],
          { session },
        );
        await this.audits.create([input.audit], { session });

        const organization = createdOrganizations[0];
        const owner = createdManagers[0];
        if (!organization || !owner) {
          throw new Error('Organization transaction returned no rows');
        }

        output = {
          organization: toPlain<OrganizationRecord>(organization),
          owner: toPlain<OrganizationManagerRecord>(owner),
        };
      });

      if (!output)
        throw new Error('Organization transaction produced no output');
      return output;
    } finally {
      await session.endSession();
    }
  }

  async findById(id: string): Promise<OrganizationRecord | null> {
    return this.organizations.findOne({ id }).lean<OrganizationRecord>().exec();
  }

  async findManyByIds(ids: string[]): Promise<OrganizationRecord[]> {
    if (ids.length === 0) return [];
    return this.organizations
      .find({ id: { $in: ids }, status: 'active' })
      .lean<OrganizationRecord[]>()
      .exec();
  }

  async search(input: {
    q?: string;
    type?: OrganizationType;
    institutionId?: string;
    programId?: string;
    limit: number;
    after?: OrganizationCursor;
  }): Promise<{ items: OrganizationRecord[]; hasMore: boolean }> {
    const filters: FilterQuery<Organization>[] = [{ status: 'active' }];

    if (input.type) filters.push({ type: input.type });
    if (input.institutionId)
      filters.push({ institutionId: input.institutionId });
    if (input.programId) filters.push({ programId: input.programId });
    if (input.q) {
      filters.push({
        normalizedName: { $regex: escapeRegex(input.q), $options: 'i' },
      });
    }
    if (input.after) {
      filters.push({
        $or: [
          { normalizedName: { $gt: input.after.normalizedName } },
          {
            normalizedName: input.after.normalizedName,
            id: { $gt: input.after.id },
          },
        ],
      });
    }

    const rows = await this.organizations
      .find({ $and: filters })
      .sort({ normalizedName: 1, id: 1 })
      .limit(input.limit + 1)
      .lean<OrganizationRecord[]>()
      .exec();

    return {
      items: rows.slice(0, input.limit),
      hasMore: rows.length > input.limit,
    };
  }

  async updateOwnedProfile(input: {
    organizationId: string;
    expectedRevision: number;
    patch: UpdateOrganizationRecord;
    audit: OrganizationAuditRecord;
  }): Promise<OrganizationRecord | null> {
    return this.updateOrganizationWithAudit(
      input.organizationId,
      input.expectedRevision,
      input.patch,
      input.audit,
    );
  }

  async updateVerification(input: {
    organizationId: string;
    expectedRevision: number;
    verificationState: OrganizationVerificationState;
    audit: OrganizationAuditRecord;
  }): Promise<OrganizationRecord | null> {
    return this.updateOrganizationWithAudit(
      input.organizationId,
      input.expectedRevision,
      {
        verificationState: input.verificationState,
      } as UpdateOrganizationRecord,
      input.audit,
    );
  }

  private async updateOrganizationWithAudit(
    organizationId: string,
    expectedRevision: number,
    patch: Record<string, unknown>,
    audit: OrganizationAuditRecord,
  ): Promise<OrganizationRecord | null> {
    const session = await this.connection.startSession();

    try {
      let output: OrganizationRecord | null = null;
      await session.withTransaction(async () => {
        const updated = await this.organizations
          .findOneAndUpdate(
            {
              id: organizationId,
              status: 'active',
              revision: expectedRevision,
            },
            { $set: patch, $inc: { revision: 1 } },
            { new: true, session },
          )
          .lean<OrganizationRecord>()
          .exec();

        if (!updated) return;
        await this.audits.create([audit], { session });
        output = updated;
      });
      return output;
    } finally {
      await session.endSession();
    }
  }

  async findManager(
    organizationId: string,
    userId: string,
  ): Promise<OrganizationManagerRecord | null> {
    return this.managers
      .findOne({ organizationId, userId })
      .lean<OrganizationManagerRecord>()
      .exec();
  }

  async listManagers(
    organizationId: string,
  ): Promise<OrganizationManagerRecord[]> {
    return this.managers
      .find({ organizationId })
      .sort({ role: 1, createdAt: 1, userId: 1 })
      .lean<OrganizationManagerRecord[]>()
      .exec();
  }

  async changeManager(input: {
    organizationId: string;
    actorUserId: string;
    targetUserId: string;
    expectedManagementRevision: number;
    expectedTargetRole: OrganizationManagerRole | null;
    nextRole: OrganizationManagerRole | null;
    audit: OrganizationAuditRecord;
  }): Promise<ManagerChangeResult> {
    const session = await this.connection.startSession();

    try {
      let output: ManagerChangeResult | undefined;

      try {
        await session.withTransaction(async () => {
          const organization = await this.organizations
            .findOne({
              id: input.organizationId,
              status: 'active',
              managementRevision: input.expectedManagementRevision,
            })
            .session(session)
            .lean<OrganizationRecord>()
            .exec();

          if (!organization) {
            throw new ManagerMutationAbort({ status: 'revision_conflict' });
          }

          const current = await this.managers
            .findOne({
              organizationId: input.organizationId,
              userId: input.targetUserId,
            })
            .session(session)
            .lean<OrganizationManagerRecord>()
            .exec();

          if ((current?.role ?? null) !== input.expectedTargetRole) {
            throw new ManagerMutationAbort({ status: 'target_state_conflict' });
          }

          if (current?.role === 'owner' && input.nextRole !== 'owner') {
            const owners = await this.managers
              .countDocuments({
                organizationId: input.organizationId,
                role: 'owner',
              })
              .session(session)
              .exec();
            if (owners <= 1) {
              throw new ManagerMutationAbort({ status: 'final_owner' });
            }
          }

          let manager: OrganizationManagerRecord | null = null;

          if (input.nextRole === null) {
            await this.managers
              .deleteOne(
                {
                  organizationId: input.organizationId,
                  userId: input.targetUserId,
                  ...(current ? { role: current.role } : {}),
                },
                { session },
              )
              .exec();
          } else {
            const updated = await this.managers
              .findOneAndUpdate(
                {
                  organizationId: input.organizationId,
                  userId: input.targetUserId,
                },
                {
                  $set: { role: input.nextRole },
                  $setOnInsert: {
                    organizationId: input.organizationId,
                    userId: input.targetUserId,
                  },
                },
                { upsert: true, new: true, session },
              )
              .lean<OrganizationManagerRecord>()
              .exec();

            if (!updated) throw new Error('Manager upsert returned no row');
            manager = updated;
          }

          const revision = await this.organizations
            .findOneAndUpdate(
              {
                id: input.organizationId,
                managementRevision: input.expectedManagementRevision,
              },
              { $inc: { managementRevision: 1 } },
              { new: true, session },
            )
            .lean<OrganizationRecord>()
            .exec();

          if (!revision) {
            throw new ManagerMutationAbort({ status: 'revision_conflict' });
          }

          await this.audits.create([input.audit], { session });

          output = {
            status: 'ok',
            manager,
            managementRevision: revision.managementRevision,
          };
        });
      } catch (error) {
        if (error instanceof ManagerMutationAbort) return error.result;
        throw error;
      }

      if (!output) throw new Error('Manager transaction produced no output');
      return output;
    } finally {
      await session.endSession();
    }
  }

  async follow(
    organizationId: string,
    userId: string,
  ): Promise<{ follow: OrganizationFollowRecord; created: boolean }> {
    const result = await this.follows
      .updateOne(
        { organizationId, userId },
        { $setOnInsert: { organizationId, userId } },
        { upsert: true },
      )
      .exec();
    const row = await this.follows
      .findOne({ organizationId, userId })
      .lean<OrganizationFollowRecord>()
      .exec();

    if (!row) throw new Error('Organization follow upsert returned no row');
    return { follow: row, created: result.upsertedCount === 1 };
  }

  async unfollow(organizationId: string, userId: string): Promise<void> {
    await this.follows.deleteOne({ organizationId, userId }).exec();
  }

  async isFollowing(organizationId: string, userId: string): Promise<boolean> {
    return Boolean(await this.follows.exists({ organizationId, userId }));
  }

  async countFollowers(organizationId: string): Promise<number> {
    return this.follows.countDocuments({ organizationId }).exec();
  }

  async listFollowedOrganizationIds(
    userId: string,
    limit: number,
  ): Promise<{ ids: string[]; truncated: boolean }> {
    const rows = await this.follows
      .find({ userId })
      .sort({ createdAt: -1, organizationId: 1 })
      .limit(limit + 1)
      .lean<OrganizationFollowRecord[]>()
      .exec();

    return {
      ids: rows.slice(0, limit).map((row) => row.organizationId),
      truncated: rows.length > limit,
    };
  }

  async createPost(
    input: Omit<OrganizationPostRecord, 'createdAt' | 'updatedAt'>,
  ): Promise<OrganizationPostRecord> {
    return toPlain<OrganizationPostRecord>(await this.posts.create(input));
  }

  async findPostById(
    organizationId: string,
    postId: string,
  ): Promise<OrganizationPostRecord | null> {
    return this.posts
      .findOne({ organizationId, id: postId })
      .lean<OrganizationPostRecord>()
      .exec();
  }

  async findPostByGlobalId(
    postId: string,
  ): Promise<OrganizationPostRecord | null> {
    return this.posts
      .findOne({ id: postId })
      .lean<OrganizationPostRecord>()
      .exec();
  }

  async updatePost(
    organizationId: string,
    postId: string,
    expectedRevision: number,
    patch: Partial<
      Pick<OrganizationPostRecord, 'title' | 'body' | 'subjectId'>
    >,
  ): Promise<OrganizationPostRecord | null> {
    return this.posts
      .findOneAndUpdate(
        { organizationId, id: postId, revision: expectedRevision },
        { $set: patch, $inc: { revision: 1 } },
        { new: true },
      )
      .lean<OrganizationPostRecord>()
      .exec();
  }

  async deletePost(organizationId: string, postId: string): Promise<boolean> {
    const result = await this.posts
      .deleteOne({ organizationId, id: postId })
      .exec();
    return result.deletedCount === 1;
  }

  async listPosts(input: {
    organizationId: string;
    limit: number;
    before?: Date;
  }): Promise<OrganizationPostRecord[]> {
    return this.posts
      .find({
        organizationId: input.organizationId,
        moderationState: 'available',
        ...(input.before ? { publishedAt: { $lt: input.before } } : {}),
      })
      .sort({ publishedAt: -1, id: 1 })
      .limit(input.limit)
      .lean<OrganizationPostRecord[]>()
      .exec();
  }

  async listFeedPosts(input: {
    organizationIds: string[];
    anchorAt: Date;
    limit: number;
  }): Promise<OrganizationPostRecord[]> {
    if (input.organizationIds.length === 0) return [];

    return this.posts
      .find({
        organizationId: { $in: input.organizationIds },
        moderationState: 'available',
        publishedAt: { $lte: input.anchorAt },
      })
      .sort({ publishedAt: -1, id: 1 })
      .limit(input.limit)
      .lean<OrganizationPostRecord[]>()
      .exec();
  }

  async listFeedPostsForFollower(input: {
    userId: string;
    anchorAt: Date;
    limit: number;
  }): Promise<OrganizationPostRecord[]> {
    return this.posts
      .aggregate<OrganizationPostRecord>([
        {
          $match: {
            moderationState: 'available',
            publishedAt: { $lte: input.anchorAt },
          },
        },
        {
          $lookup: {
            from: 'organization_follows',
            let: { organizationId: '$organizationId' },
            pipeline: [
              {
                $match: {
                  $expr: {
                    $and: [
                      { $eq: ['$organizationId', '$organizationId'] },
                      { $eq: ['$userId', input.userId] },
                    ],
                  },
                },
              },
              { $limit: 1 },
            ],
            as: '__viewerFollow',
          },
        },
        { $match: { '__viewerFollow.0': { $exists: true } } },
        { $sort: { publishedAt: -1, id: 1 } },
        { $limit: input.limit },
        { $project: { __viewerFollow: 0 } },
      ])
      .exec();
  }

  async createEvent(
    input: Omit<OrganizationEventRecord, 'createdAt' | 'updatedAt'>,
  ): Promise<OrganizationEventRecord> {
    return toPlain<OrganizationEventRecord>(await this.events.create(input));
  }

  async findEventById(
    organizationId: string,
    eventId: string,
  ): Promise<OrganizationEventRecord | null> {
    return this.events
      .findOne({ organizationId, id: eventId })
      .lean<OrganizationEventRecord>()
      .exec();
  }

  async updateEvent(
    organizationId: string,
    eventId: string,
    expectedRevision: number,
    patch: Partial<
      Pick<
        OrganizationEventRecord,
        | 'title'
        | 'description'
        | 'startsAt'
        | 'endsAt'
        | 'locationLabel'
        | 'externalUrl'
        | 'state'
      >
    >,
  ): Promise<OrganizationEventRecord | null> {
    return this.events
      .findOneAndUpdate(
        { organizationId, id: eventId, revision: expectedRevision },
        { $set: patch, $inc: { revision: 1 } },
        { new: true },
      )
      .lean<OrganizationEventRecord>()
      .exec();
  }

  async listEvents(input: {
    organizationId: string;
    limit: number;
    from?: Date;
  }): Promise<OrganizationEventRecord[]> {
    return this.events
      .find({
        organizationId: input.organizationId,
        moderationState: 'available',
        ...(input.from ? { startsAt: { $gte: input.from } } : {}),
      })
      .sort({ startsAt: 1, id: 1 })
      .limit(input.limit)
      .lean<OrganizationEventRecord[]>()
      .exec();
  }

  async createLink(
    input: Omit<OrganizationLinkRecord, 'createdAt' | 'updatedAt'>,
  ): Promise<OrganizationLinkRecord> {
    return toPlain<OrganizationLinkRecord>(await this.links.create(input));
  }

  async deleteLink(organizationId: string, linkId: string): Promise<boolean> {
    const result = await this.links
      .deleteOne({ organizationId, id: linkId })
      .exec();
    return result.deletedCount === 1;
  }

  async listLinks(organizationId: string): Promise<OrganizationLinkRecord[]> {
    return this.links
      .find({ organizationId })
      .sort({ createdAt: 1, id: 1 })
      .lean<OrganizationLinkRecord[]>()
      .exec();
  }

  async featureResource(input: {
    organizationId: string;
    resourceId: string;
    createdByUserId: string;
  }): Promise<OrganizationFeaturedResourceRecord> {
    await this.featuredResources
      .updateOne(
        {
          organizationId: input.organizationId,
          resourceId: input.resourceId,
        },
        { $setOnInsert: input },
        { upsert: true },
      )
      .exec();

    const row = await this.featuredResources
      .findOne({
        organizationId: input.organizationId,
        resourceId: input.resourceId,
      })
      .lean<OrganizationFeaturedResourceRecord>()
      .exec();

    if (!row) throw new Error('Featured Resource upsert returned no row');
    return row;
  }

  async unfeatureResource(
    organizationId: string,
    resourceId: string,
  ): Promise<void> {
    await this.featuredResources
      .deleteOne({ organizationId, resourceId })
      .exec();
  }

  async listFeaturedResources(
    organizationId: string,
  ): Promise<OrganizationFeaturedResourceRecord[]> {
    return this.featuredResources
      .find({ organizationId })
      .sort({ createdAt: -1, resourceId: 1 })
      .lean<OrganizationFeaturedResourceRecord[]>()
      .exec();
  }

  async upsertPendingReport(
    input: Parameters<OrganizationStore['upsertPendingReport']>[0],
  ): Promise<OrganizationReportRecord> {
    const row = await this.reports
      .findOneAndUpdate(
        {
          targetType: input.targetType,
          targetId: input.targetId,
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
      .lean<OrganizationReportRecord>()
      .exec();

    if (!row) throw new Error('Organization report upsert returned no row');
    return row;
  }
}
