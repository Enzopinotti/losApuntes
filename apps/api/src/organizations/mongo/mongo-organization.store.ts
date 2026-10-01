import { Injectable } from '@nestjs/common';
import { InjectConnection, InjectModel } from '@nestjs/mongoose';
import type { ClientSession, Connection, FilterQuery, Model } from 'mongoose';

import {
  ORGANIZATION_FEATURED_RESOURCE_LIMIT,
  ORGANIZATION_LINK_LIMIT,
  ORGANIZATION_MANAGER_LIMIT,
} from '../domain/organization-limits';
import type {
  AuthorizedOrganizationMutationResult,
  ManagerChangeResult,
  OrganizationStore,
  OrganizationWriteAuthority,
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

type AuthorizedMutationFailure = Extract<
  AuthorizedOrganizationMutationResult,
  {
    status:
      | 'authority_stale'
      | 'state_conflict'
      | 'not_found'
      | 'collection_limit';
  }
>;

class AuthorizedMutationAbort extends Error {
  constructor(readonly result: AuthorizedMutationFailure) {
    super(result.status);
  }
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

  async commitAuthorizedMutation(input: {
    organizationId: string;
    authority: OrganizationWriteAuthority;
    mutation: Parameters<
      OrganizationStore['commitAuthorizedMutation']
    >[0]['mutation'];
    audit: OrganizationAuditRecord;
  }): Promise<AuthorizedOrganizationMutationResult> {
    const session = await this.connection.startSession();

    try {
      let output: AuthorizedOrganizationMutationResult | undefined;

      try {
        await session.withTransaction(async () => {
          await this.assertWriteAuthority(
            input.organizationId,
            input.authority,
            session,
          );

          const mutation = input.mutation;

          switch (mutation.kind) {
            case 'organization.update': {
              const updated = await this.organizations
                .findOneAndUpdate(
                  {
                    id: input.organizationId,
                    status: 'active',
                    revision: mutation.expectedRevision,
                    managementRevision:
                      input.authority.expectedManagementRevision,
                  },
                  {
                    $set: mutation.patch,
                    $inc: { revision: 1 },
                  },
                  { new: true, session },
                )
                .lean<OrganizationRecord>()
                .exec();

              if (!updated) {
                throw new AuthorizedMutationAbort({
                  status: 'state_conflict',
                });
              }

              await this.audits.create([input.audit], { session });
              output = {
                status: 'ok',
                kind: mutation.kind,
                value: updated,
              };
              return;
            }

            case 'post.create': {
              const created = await this.posts.create([mutation.record], {
                session,
              });
              const post = created[0];
              if (!post) throw new Error('Post transaction returned no row');

              await this.audits.create([input.audit], { session });
              output = {
                status: 'ok',
                kind: mutation.kind,
                value: toPlain<OrganizationPostRecord>(post),
              };
              return;
            }

            case 'post.update': {
              const updated = await this.posts
                .findOneAndUpdate(
                  {
                    organizationId: input.organizationId,
                    id: mutation.postId,
                    revision: mutation.expectedRevision,
                    moderationState: 'available',
                  },
                  {
                    $set: mutation.patch,
                    $inc: { revision: 1 },
                  },
                  { new: true, session },
                )
                .lean<OrganizationPostRecord>()
                .exec();

              if (!updated) {
                throw new AuthorizedMutationAbort({
                  status: 'state_conflict',
                });
              }

              await this.audits.create([input.audit], { session });
              output = {
                status: 'ok',
                kind: mutation.kind,
                value: updated,
              };
              return;
            }

            case 'post.delete': {
              const deleted = await this.posts
                .deleteOne(
                  {
                    organizationId: input.organizationId,
                    id: mutation.postId,
                  },
                  { session },
                )
                .exec();

              if (deleted.deletedCount !== 1) {
                throw new AuthorizedMutationAbort({ status: 'not_found' });
              }

              await this.audits.create([input.audit], { session });
              output = {
                status: 'ok',
                kind: mutation.kind,
                value: true,
              };
              return;
            }

            case 'event.create': {
              const created = await this.events.create([mutation.record], {
                session,
              });
              const event = created[0];
              if (!event) throw new Error('Event transaction returned no row');

              await this.audits.create([input.audit], { session });
              output = {
                status: 'ok',
                kind: mutation.kind,
                value: toPlain<OrganizationEventRecord>(event),
              };
              return;
            }

            case 'event.update': {
              const updated = await this.events
                .findOneAndUpdate(
                  {
                    organizationId: input.organizationId,
                    id: mutation.eventId,
                    revision: mutation.expectedRevision,
                  },
                  {
                    $set: mutation.patch,
                    $inc: { revision: 1 },
                  },
                  { new: true, session },
                )
                .lean<OrganizationEventRecord>()
                .exec();

              if (!updated) {
                throw new AuthorizedMutationAbort({
                  status: 'state_conflict',
                });
              }

              await this.audits.create([input.audit], { session });
              output = {
                status: 'ok',
                kind: mutation.kind,
                value: updated,
              };
              return;
            }

            case 'link.create': {
              await this.acquireCapacityLock(
                input.organizationId,
                input.authority.expectedManagementRevision,
                session,
              );
              const linkCount = await this.links
                .countDocuments({ organizationId: input.organizationId })
                .session(session)
                .exec();

              if (linkCount >= ORGANIZATION_LINK_LIMIT) {
                throw new AuthorizedMutationAbort({
                  status: 'collection_limit',
                  collection: 'links',
                });
              }

              const created = await this.links.create([mutation.record], {
                session,
              });
              const link = created[0];
              if (!link) throw new Error('Link transaction returned no row');

              await this.audits.create([input.audit], { session });
              output = {
                status: 'ok',
                kind: mutation.kind,
                value: toPlain<OrganizationLinkRecord>(link),
              };
              return;
            }

            case 'link.delete': {
              const deleted = await this.links
                .deleteOne(
                  {
                    organizationId: input.organizationId,
                    id: mutation.linkId,
                  },
                  { session },
                )
                .exec();

              if (deleted.deletedCount !== 1) {
                throw new AuthorizedMutationAbort({ status: 'not_found' });
              }

              await this.audits.create([input.audit], { session });
              output = {
                status: 'ok',
                kind: mutation.kind,
                value: true,
              };
              return;
            }

            case 'resource.feature': {
              const existing = await this.featuredResources
                .findOne({
                  organizationId: input.organizationId,
                  resourceId: mutation.resourceId,
                })
                .session(session)
                .lean<OrganizationFeaturedResourceRecord>()
                .exec();

              if (existing) {
                output = {
                  status: 'ok',
                  kind: mutation.kind,
                  value: existing,
                };
                return;
              }

              await this.acquireCapacityLock(
                input.organizationId,
                input.authority.expectedManagementRevision,
                session,
              );
              const featuredCount = await this.featuredResources
                .countDocuments({ organizationId: input.organizationId })
                .session(session)
                .exec();

              if (featuredCount >= ORGANIZATION_FEATURED_RESOURCE_LIMIT) {
                throw new AuthorizedMutationAbort({
                  status: 'collection_limit',
                  collection: 'featured_resources',
                });
              }

              const created = await this.featuredResources.create(
                [
                  {
                    organizationId: input.organizationId,
                    resourceId: mutation.resourceId,
                    createdByUserId: mutation.createdByUserId,
                  },
                ],
                { session },
              );
              const featured = created[0];
              if (!featured) {
                throw new Error(
                  'Featured Resource transaction returned no row',
                );
              }

              await this.audits.create([input.audit], { session });
              output = {
                status: 'ok',
                kind: mutation.kind,
                value: toPlain<OrganizationFeaturedResourceRecord>(featured),
              };
              return;
            }

            case 'resource.unfeature': {
              const deleted = await this.featuredResources
                .deleteOne(
                  {
                    organizationId: input.organizationId,
                    resourceId: mutation.resourceId,
                  },
                  { session },
                )
                .exec();

              if (deleted.deletedCount === 1) {
                await this.audits.create([input.audit], { session });
              }

              output = {
                status: 'ok',
                kind: mutation.kind,
                value: true,
              };
              return;
            }
          }
        });
      } catch (error) {
        if (error instanceof AuthorizedMutationAbort) return error.result;
        throw error;
      }

      if (!output) {
        throw new Error('Authorized mutation transaction produced no output');
      }
      return output;
    } finally {
      await session.endSession();
    }
  }

  private async acquireCapacityLock(
    organizationId: string,
    expectedManagementRevision: number,
    session: ClientSession,
  ): Promise<void> {
    const locked = await this.organizations
      .findOneAndUpdate(
        {
          id: organizationId,
          status: 'active',
          managementRevision: expectedManagementRevision,
        },
        { $inc: { capacityRevision: 1 } },
        { new: true, session },
      )
      .lean<OrganizationRecord>()
      .exec();

    if (!locked) {
      throw new AuthorizedMutationAbort({ status: 'authority_stale' });
    }
  }

  private async assertWriteAuthority(
    organizationId: string,
    authority: OrganizationWriteAuthority,
    session: ClientSession,
  ): Promise<void> {
    const organization = await this.organizations
      .findOne({
        id: organizationId,
        status: 'active',
        managementRevision: authority.expectedManagementRevision,
      })
      .session(session)
      .lean<OrganizationRecord>()
      .exec();

    if (!organization) {
      throw new AuthorizedMutationAbort({ status: 'authority_stale' });
    }

    const manager = await this.managers
      .findOne({
        organizationId,
        userId: authority.actorUserId,
        role: { $in: [...authority.allowedRoles] },
      })
      .session(session)
      .lean<OrganizationManagerRecord>()
      .exec();

    if (!manager) {
      throw new AuthorizedMutationAbort({ status: 'authority_stale' });
    }
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
      },
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

  async findEventById(
    organizationId: string,
    eventId: string,
  ): Promise<OrganizationEventRecord | null> {
    return this.events
      .findOne({ organizationId, id: eventId })
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

  async listLinks(organizationId: string): Promise<OrganizationLinkRecord[]> {
    return this.links
      .find({ organizationId })
      .sort({ createdAt: 1, id: 1 })
      .lean<OrganizationLinkRecord[]>()
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
