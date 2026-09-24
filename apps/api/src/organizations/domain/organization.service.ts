import {
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';

import { AcademicService } from '../../academic/domain/academic.service';
import { ProfileService } from '../../profile/domain/profile.service';
import { ResourceService } from '../../resources/domain/resource.service';
import type {
  ChangeOrganizationManagerDto,
  CreateOrganizationDto,
  CreateOrganizationEventDto,
  CreateOrganizationLinkDto,
  CreateOrganizationPostDto,
  OrganizationSearchDto,
  RemoveOrganizationManagerDto,
  UpdateOrganizationDto,
  UpdateOrganizationEventDto,
  UpdateOrganizationPostDto,
  UpdateOrganizationVerificationDto,
} from '../dto/organization.dto';
import {
  ORGANIZATION_STORE,
  type OrganizationStore,
} from './organization.store';
import type {
  OrganizationAuditRecord,
  OrganizationCursor,
  OrganizationEventRecord,
  OrganizationManagerRecord,
  OrganizationManagerRole,
  OrganizationPostRecord,
  OrganizationRecord,
} from './organization.types';

const MAX_MANAGERS = 20;
const MAX_LINKS = 20;
const MAX_FEATURED_RESOURCES = 20;

function cleanText(value: string): string {
  return value.normalize('NFC').trim().replace(/\s+/gu, ' ');
}

function cleanNullable(value: string | null | undefined): string | null {
  if (value === null || value === undefined) return null;
  const cleaned = cleanText(value);
  return cleaned.length > 0 ? cleaned : null;
}

function normalizeName(value: string): string {
  return value
    .normalize('NFKC')
    .trim()
    .replace(/\s+/gu, ' ')
    .toLocaleLowerCase('es-AR');
}

function httpsUrl(
  value: string | null | undefined,
  code = 'ORGANIZATION_LINK_INVALID',
): string | null {
  if (value === null || value === undefined) return null;

  try {
    const url = new URL(value.trim());
    if (
      url.protocol !== 'https:' ||
      url.username ||
      url.password ||
      !url.hostname
    ) {
      throw new Error('invalid url');
    }
    return url.toString();
  } catch {
    throw new UnprocessableEntityException({
      code,
      message: 'Organization URLs must be absolute HTTPS URLs',
    });
  }
}

function encodeCursor(cursor: OrganizationCursor): string {
  return Buffer.from(JSON.stringify(cursor), 'utf8').toString('base64url');
}

function decodeCursor(value?: string): OrganizationCursor | undefined {
  if (!value) return undefined;

  try {
    const parsed = JSON.parse(
      Buffer.from(value, 'base64url').toString('utf8'),
    ) as Record<string, unknown>;

    if (
      typeof parsed.normalizedName !== 'string' ||
      typeof parsed.id !== 'string'
    ) {
      throw new Error('invalid cursor');
    }

    return {
      normalizedName: parsed.normalizedName,
      id: parsed.id,
    };
  } catch {
    throw new UnprocessableEntityException({
      code: 'ORGANIZATION_CURSOR_INVALID',
      message: 'Organization cursor is invalid',
    });
  }
}

@Injectable()
export class OrganizationService {
  constructor(
    @Inject(ORGANIZATION_STORE)
    private readonly store: OrganizationStore,
    private readonly academic: AcademicService,
    private readonly profiles: ProfileService,
    private readonly resources: ResourceService,
  ) {}

  async create(userId: string, dto: CreateOrganizationDto) {
    const actor = await this.profiles.getAttributionForUser(userId);
    if (!actor) {
      throw new UnprocessableEntityException({
        code: 'ORGANIZATION_PROFILE_REQUIRED',
        message: 'Create a Profile before claiming an Organization',
      });
    }

    const scope = await this.resolveScope({
      institutionId: dto.institutionId,
      campusId: dto.campusId,
      academicUnitId: dto.academicUnitId,
      programId: dto.programId,
    });
    const name = cleanText(dto.name);
    const organizationId = randomUUID();

    const created = await this.store.createWithOwner({
      organization: {
        id: organizationId,
        name,
        normalizedName: normalizeName(name),
        type: dto.type,
        about: cleanNullable(dto.about),
        avatarUrl: httpsUrl(dto.avatarUrl),
        coverUrl: httpsUrl(dto.coverUrl),
        websiteUrl: httpsUrl(dto.websiteUrl),
        institutionId: scope.institutionId,
        campusId: scope.campusId,
        academicUnitId: scope.academicUnitId,
        programId: scope.programId,
        claimState: 'claimed',
        verificationState: 'unverified',
        status: 'active',
        revision: 1,
        managementRevision: 1,
      },
      ownerUserId: userId,
      audit: this.audit({
        organizationId,
        event: 'organization.created',
        actorUserId: userId,
        targetUserId: userId,
        previousRole: null,
        nextRole: 'owner',
        reason: 'Organization claimed by creator',
        metadata: { profileId: actor.profileId },
      }),
    });

    return {
      organization: await this.detailProjection(
        created.organization,
        userId,
      ),
    };
  }

  async search(viewerUserId: string | undefined, dto: OrganizationSearchDto) {
    const filters = await this.canonicalSearchFilters(dto);
    const result = await this.store.search({
      ...filters,
      limit: dto.limit,
      after: decodeCursor(dto.cursor),
    });
    const last = result.items.at(-1);

    return {
      items: await Promise.all(
        result.items.map((row) => this.cardProjection(row, viewerUserId)),
      ),
      nextCursor:
        result.hasMore && last
          ? encodeCursor({
              normalizedName: last.normalizedName,
              id: last.id,
            })
          : null,
    };
  }

  async get(id: string, viewerUserId?: string) {
    const organization = await this.requireActive(id);
    return {
      organization: await this.detailProjection(organization, viewerUserId),
    };
  }

  async managementSnapshot(userId: string, id: string) {
    const organization = await this.requireActive(id);
    const actor = await this.requireManager(id, userId);
    const managers = await this.store.listManagers(id);
    const profiles = await this.profiles.getAttributionsForUsers(
      managers.map((row) => row.userId),
    );

    return {
      organization: {
        id: organization.id,
        name: organization.name,
        revision: organization.revision,
        managementRevision: organization.managementRevision,
        verificationState: organization.verificationState,
      },
      actorRole: actor.role,
      managers: managers.map((row) => ({
        role: row.role,
        profile: profiles.get(row.userId) ?? {
          profileId: null,
          displayName: 'Usuario de Los Apuntes',
          avatarUrl: null,
        },
        addedAt: row.createdAt.toISOString(),
      })),
    };
  }

  async update(userId: string, id: string, dto: UpdateOrganizationDto) {
    const organization = await this.requireActive(id);
    await this.requireRole(id, userId, ['owner', 'admin']);

    if (organization.revision !== dto.expectedRevision) {
      this.revisionConflict();
    }

    const patch: Record<string, unknown> = {};
    if (dto.name !== undefined) {
      const name = cleanText(dto.name);
      patch.name = name;
      patch.normalizedName = normalizeName(name);
    }
    if (dto.about !== undefined) patch.about = cleanNullable(dto.about);
    if (dto.avatarUrl !== undefined) patch.avatarUrl = httpsUrl(dto.avatarUrl);
    if (dto.coverUrl !== undefined) patch.coverUrl = httpsUrl(dto.coverUrl);
    if (dto.websiteUrl !== undefined) {
      patch.websiteUrl = httpsUrl(dto.websiteUrl);
    }

    if (Object.keys(patch).length === 0) {
      throw new UnprocessableEntityException({
        code: 'ORGANIZATION_UPDATE_EMPTY',
        message: 'Organization update contains no changes',
      });
    }

    const updated = await this.store.updateOwnedProfile({
      organizationId: id,
      expectedRevision: dto.expectedRevision,
      patch,
      audit: this.audit({
        organizationId: id,
        event: 'organization.updated',
        actorUserId: userId,
        targetUserId: null,
        previousRole: null,
        nextRole: null,
        reason: 'Organization profile updated',
        metadata: { changedFields: Object.keys(patch).length },
      }),
    });

    if (!updated) this.revisionConflict();
    return { organization: await this.detailProjection(updated, userId) };
  }

  async updateVerification(
    userId: string,
    id: string,
    dto: UpdateOrganizationVerificationDto,
  ) {
    const organization = await this.requireActive(id);
    if (organization.revision !== dto.expectedRevision) this.revisionConflict();

    if (organization.verificationState === dto.verificationState) {
      return {
        organization: await this.detailProjection(organization, userId),
        changed: false,
      };
    }

    const updated = await this.store.updateVerification({
      organizationId: id,
      expectedRevision: dto.expectedRevision,
      verificationState: dto.verificationState,
      audit: this.audit({
        organizationId: id,
        event: 'organization.verification_updated',
        actorUserId: userId,
        targetUserId: null,
        previousRole: null,
        nextRole: null,
        reason: cleanText(dto.reason),
        metadata: {
          previousVerificationState: organization.verificationState,
          nextVerificationState: dto.verificationState,
        },
      }),
    });

    if (!updated) this.revisionConflict();
    return {
      organization: await this.detailProjection(updated, userId),
      changed: true,
    };
  }

  async changeManager(
    userId: string,
    id: string,
    profileId: string,
    dto: ChangeOrganizationManagerDto,
  ) {
    const organization = await this.requireActive(id);
    const actor = await this.requireRole(id, userId, ['owner', 'admin']);
    if (organization.managementRevision !== dto.expectedManagementRevision) {
      this.managementConflict();
    }

    const targetUserId =
      await this.profiles.resolveUserIdByProfileId(profileId);
    if (!targetUserId) this.notFound();

    const current = await this.store.findManager(id, targetUserId);
    this.assertManagerMutationAllowed(actor.role, current?.role ?? null, dto.role);

    if (current?.role === dto.role) {
      return this.managementSnapshot(userId, id);
    }

    if (!current) {
      const managers = await this.store.listManagers(id);
      if (managers.length >= MAX_MANAGERS) {
        throw new UnprocessableEntityException({
          code: 'ORGANIZATION_MANAGER_LIMIT',
          message: 'Organization manager limit reached',
        });
      }
    }

    const event =
      current === null
        ? 'organization.manager_granted'
        : 'organization.manager_changed';
    const result = await this.store.changeManager({
      organizationId: id,
      actorUserId: userId,
      targetUserId,
      expectedManagementRevision: dto.expectedManagementRevision,
      expectedTargetRole: current?.role ?? null,
      nextRole: dto.role,
      audit: this.audit({
        organizationId: id,
        event,
        actorUserId: userId,
        targetUserId,
        previousRole: current?.role ?? null,
        nextRole: dto.role,
        reason: cleanText(dto.reason),
        metadata: {},
      }),
    });

    this.assertManagerChangeResult(result);
    return this.managementSnapshot(userId, id);
  }

  async removeManager(
    userId: string,
    id: string,
    profileId: string,
    dto: RemoveOrganizationManagerDto,
  ) {
    const organization = await this.requireActive(id);
    const actor = await this.requireRole(id, userId, ['owner', 'admin']);
    if (organization.managementRevision !== dto.expectedManagementRevision) {
      this.managementConflict();
    }

    const targetUserId =
      await this.profiles.resolveUserIdByProfileId(profileId);
    if (!targetUserId) this.notFound();

    const current = await this.store.findManager(id, targetUserId);
    if (!current) this.notFound();
    this.assertManagerMutationAllowed(actor.role, current.role, null);

    const result = await this.store.changeManager({
      organizationId: id,
      actorUserId: userId,
      targetUserId,
      expectedManagementRevision: dto.expectedManagementRevision,
      expectedTargetRole: current.role,
      nextRole: null,
      audit: this.audit({
        organizationId: id,
        event: 'organization.manager_revoked',
        actorUserId: userId,
        targetUserId,
        previousRole: current.role,
        nextRole: null,
        reason: cleanText(dto.reason),
        metadata: {},
      }),
    });

    this.assertManagerChangeResult(result);
    return this.managementSnapshot(userId, id);
  }

  async follow(userId: string, id: string) {
    await this.requireActive(id);
    const result = await this.store.follow(id, userId);
    return { following: true, changed: result.created };
  }

  async unfollow(userId: string, id: string) {
    await this.requireActive(id);
    const wasFollowing = await this.store.isFollowing(id, userId);
    await this.store.unfollow(id, userId);
    return { following: false, changed: wasFollowing };
  }

  async createPost(
    userId: string,
    organizationId: string,
    dto: CreateOrganizationPostDto,
  ) {
    const organization = await this.requireActive(organizationId);
    await this.requireRole(organizationId, userId, [
      'owner',
      'admin',
      'editor',
    ]);
    const subjectId = dto.subjectId
      ? (await this.academic.resolveResourceContext(dto.subjectId)).subjectId
      : null;
    const post = await this.store.createPost({
      id: randomUUID(),
      organizationId,
      createdByUserId: userId,
      title: cleanNullable(dto.title),
      body: cleanText(dto.body),
      subjectId,
      moderationState: 'available',
      revision: 1,
      publishedAt: new Date(),
    });

    return { post: await this.postProjection(post, organization) };
  }

  async updatePost(
    userId: string,
    organizationId: string,
    postId: string,
    dto: UpdateOrganizationPostDto,
  ) {
    const organization = await this.requireActive(organizationId);
    await this.requireRole(organizationId, userId, [
      'owner',
      'admin',
      'editor',
    ]);
    const current = await this.store.findPostById(organizationId, postId);
    if (!current || current.moderationState !== 'available') this.notFound();

    const patch: {
      title?: string | null;
      body?: string;
      subjectId?: string | null;
    } = {};
    if (dto.title !== undefined) patch.title = cleanNullable(dto.title);
    if (dto.body !== undefined) patch.body = cleanText(dto.body);
    if (dto.subjectId !== undefined) {
      patch.subjectId = dto.subjectId
        ? (await this.academic.resolveResourceContext(dto.subjectId)).subjectId
        : null;
    }

    if (Object.keys(patch).length === 0) {
      throw new UnprocessableEntityException({
        code: 'ORGANIZATION_POST_UPDATE_EMPTY',
        message: 'Organization post update contains no changes',
      });
    }

    const updated = await this.store.updatePost(
      organizationId,
      postId,
      dto.expectedRevision,
      patch,
    );
    if (!updated) {
      throw new ConflictException({
        code: 'ORGANIZATION_POST_REVISION_CONFLICT',
        message: 'Organization post changed concurrently',
      });
    }

    return { post: await this.postProjection(updated, organization) };
  }

  async deletePost(
    userId: string,
    organizationId: string,
    postId: string,
  ): Promise<void> {
    await this.requireActive(organizationId);
    await this.requireRole(organizationId, userId, [
      'owner',
      'admin',
      'editor',
    ]);
    const deleted = await this.store.deletePost(organizationId, postId);
    if (!deleted) this.notFound();
  }

  async listPosts(
    organizationId: string,
    limit: number,
    before?: string,
  ) {
    const organization = await this.requireActive(organizationId);
    const rows = await this.store.listPosts({
      organizationId,
      limit,
      ...(before ? { before: new Date(before) } : {}),
    });

    return {
      items: await Promise.all(
        rows.map((row) => this.postProjection(row, organization)),
      ),
    };
  }

  async createEvent(
    userId: string,
    organizationId: string,
    dto: CreateOrganizationEventDto,
  ) {
    await this.requireActive(organizationId);
    await this.requireRole(organizationId, userId, [
      'owner',
      'admin',
      'editor',
    ]);
    const startsAt = new Date(dto.startsAt);
    const endsAt = dto.endsAt ? new Date(dto.endsAt) : null;
    this.assertEventPeriod(startsAt, endsAt);

    const event = await this.store.createEvent({
      id: randomUUID(),
      organizationId,
      createdByUserId: userId,
      title: cleanText(dto.title),
      description: cleanNullable(dto.description),
      startsAt,
      endsAt,
      locationLabel: cleanNullable(dto.locationLabel),
      externalUrl: httpsUrl(dto.externalUrl),
      state: 'scheduled',
      revision: 1,
    });

    return { event: this.eventProjection(event) };
  }

  async updateEvent(
    userId: string,
    organizationId: string,
    eventId: string,
    dto: UpdateOrganizationEventDto,
  ) {
    await this.requireActive(organizationId);
    await this.requireRole(organizationId, userId, [
      'owner',
      'admin',
      'editor',
    ]);
    const current = await this.store.findEventById(organizationId, eventId);
    if (!current) this.notFound();

    const startsAt =
      dto.startsAt === undefined ? current.startsAt : new Date(dto.startsAt);
    const endsAt =
      dto.endsAt === undefined
        ? current.endsAt
        : dto.endsAt
          ? new Date(dto.endsAt)
          : null;
    this.assertEventPeriod(startsAt, endsAt);

    const patch: Parameters<OrganizationStore['updateEvent']>[3] = {};
    if (dto.title !== undefined) patch.title = cleanText(dto.title);
    if (dto.description !== undefined) {
      patch.description = cleanNullable(dto.description);
    }
    if (dto.startsAt !== undefined) patch.startsAt = startsAt;
    if (dto.endsAt !== undefined) patch.endsAt = endsAt;
    if (dto.locationLabel !== undefined) {
      patch.locationLabel = cleanNullable(dto.locationLabel);
    }
    if (dto.externalUrl !== undefined) {
      patch.externalUrl = httpsUrl(dto.externalUrl);
    }
    if (dto.state !== undefined) patch.state = dto.state;

    if (Object.keys(patch).length === 0) {
      throw new UnprocessableEntityException({
        code: 'ORGANIZATION_EVENT_UPDATE_EMPTY',
        message: 'Organization event update contains no changes',
      });
    }

    const updated = await this.store.updateEvent(
      organizationId,
      eventId,
      dto.expectedRevision,
      patch,
    );
    if (!updated) {
      throw new ConflictException({
        code: 'ORGANIZATION_EVENT_REVISION_CONFLICT',
        message: 'Organization event changed concurrently',
      });
    }

    return { event: this.eventProjection(updated) };
  }

  async listEvents(
    organizationId: string,
    limit: number,
    from?: string,
  ) {
    await this.requireActive(organizationId);
    const rows = await this.store.listEvents({
      organizationId,
      limit,
      ...(from ? { from: new Date(from) } : {}),
    });

    return { items: rows.map((row) => this.eventProjection(row)) };
  }

  async createLink(
    userId: string,
    organizationId: string,
    dto: CreateOrganizationLinkDto,
  ) {
    await this.requireActive(organizationId);
    await this.requireRole(organizationId, userId, [
      'owner',
      'admin',
      'editor',
    ]);
    const links = await this.store.listLinks(organizationId);
    if (links.length >= MAX_LINKS) {
      throw new UnprocessableEntityException({
        code: 'ORGANIZATION_LINK_LIMIT',
        message: 'Organization link limit reached',
      });
    }

    const link = await this.store.createLink({
      id: randomUUID(),
      organizationId,
      createdByUserId: userId,
      label: cleanText(dto.label),
      url: httpsUrl(dto.url)!,
    });

    return { link: this.linkProjection(link) };
  }

  async deleteLink(
    userId: string,
    organizationId: string,
    linkId: string,
  ): Promise<void> {
    await this.requireActive(organizationId);
    await this.requireRole(organizationId, userId, [
      'owner',
      'admin',
      'editor',
    ]);
    if (!(await this.store.deleteLink(organizationId, linkId))) this.notFound();
  }

  async featureResource(
    userId: string,
    organizationId: string,
    resourceId: string,
  ) {
    await this.requireActive(organizationId);
    await this.requireRole(organizationId, userId, [
      'owner',
      'admin',
      'editor',
    ]);

    try {
      await this.resources.get(resourceId);
    } catch (error) {
      if (error instanceof NotFoundException) {
        throw new UnprocessableEntityException({
          code: 'ORGANIZATION_RESOURCE_NOT_PUBLIC',
          message: 'Only currently public Resources may be featured',
        });
      }
      throw error;
    }

    const current = await this.store.listFeaturedResources(organizationId);
    if (
      !current.some((row) => row.resourceId === resourceId) &&
      current.length >= MAX_FEATURED_RESOURCES
    ) {
      throw new UnprocessableEntityException({
        code: 'ORGANIZATION_RESOURCE_LIMIT',
        message: 'Featured Resource limit reached',
      });
    }

    await this.store.featureResource({
      organizationId,
      resourceId,
      createdByUserId: userId,
    });

    return { featured: true };
  }

  async unfeatureResource(
    userId: string,
    organizationId: string,
    resourceId: string,
  ): Promise<void> {
    await this.requireActive(organizationId);
    await this.requireRole(organizationId, userId, [
      'owner',
      'admin',
      'editor',
    ]);
    await this.store.unfeatureResource(organizationId, resourceId);
  }

  async getFeedCandidates(userId: string, anchorAt: Date, limit: number) {
    const posts = await this.store.listFeedPostsForFollower({
      userId,
      anchorAt,
      limit,
    });
    const organizations = new Map(
      (
        await this.store.findManyByIds(
          [...new Set(posts.map((row) => row.organizationId))],
        )
      ).map((row) => [row.id, row] as const),
    );

    return posts.flatMap((post) => {
      const organization = organizations.get(post.organizationId);
      if (!organization) return [];
      return [
        {
          id: post.id,
          organizationId: organization.id,
          organizationName: organization.name,
          verificationState: organization.verificationState,
          subjectId: post.subjectId,
          title: post.title ?? organization.name,
          body: post.body,
          publishedAt: post.publishedAt,
        },
      ];
    });
  }

  private async detailProjection(
    organization: OrganizationRecord,
    viewerUserId?: string,
  ) {
    const [followers, managers, links, featured, posts, events, viewerManager] =
      await Promise.all([
        this.store.countFollowers(organization.id),
        this.store.listManagers(organization.id),
        this.store.listLinks(organization.id),
        this.store.listFeaturedResources(organization.id),
        this.store.listPosts({ organizationId: organization.id, limit: 10 }),
        this.store.listEvents({
          organizationId: organization.id,
          limit: 10,
          from: new Date(Date.now() - 24 * 60 * 60 * 1000),
        }),
        viewerUserId
          ? this.store.findManager(organization.id, viewerUserId)
          : Promise.resolve(null),
      ]);
    const [managerProfiles, scope, following] = await Promise.all([
      this.profiles.getAttributionsForUsers(
        managers.slice(0, MAX_MANAGERS).map((row) => row.userId),
      ),
      this.scopeProjection(organization),
      viewerUserId
        ? this.store.isFollowing(organization.id, viewerUserId)
        : Promise.resolve(false),
    ]);

    const publicResources = [];
    for (const row of featured.slice(0, MAX_FEATURED_RESOURCES)) {
      try {
        publicResources.push((await this.resources.get(row.resourceId)).resource);
      } catch (error) {
        if (!(error instanceof NotFoundException)) throw error;
      }
    }

    return {
      id: organization.id,
      name: organization.name,
      type: organization.type,
      about: organization.about,
      avatarUrl: organization.avatarUrl,
      coverUrl: organization.coverUrl,
      websiteUrl: organization.websiteUrl,
      claimState: organization.claimState,
      verificationState: organization.verificationState,
      scope,
      followerCount: followers,
      managers: managers.slice(0, MAX_MANAGERS).map((row) => ({
        role: row.role,
        profile: managerProfiles.get(row.userId) ?? {
          profileId: null,
          displayName: 'Usuario de Los Apuntes',
          avatarUrl: null,
        },
      })),
      links: links.slice(0, MAX_LINKS).map((row) => this.linkProjection(row)),
      featuredResources: publicResources,
      posts: await Promise.all(
        posts.map((row) => this.postProjection(row, organization)),
      ),
      events: events.map((row) => this.eventProjection(row)),
      viewer: viewerUserId
        ? {
            following,
            managementRole: viewerManager?.role ?? null,
          }
        : undefined,
      revision: organization.revision,
      managementRevision:
        viewerManager !== null ? organization.managementRevision : undefined,
      createdAt: organization.createdAt.toISOString(),
      updatedAt: organization.updatedAt.toISOString(),
    };
  }

  private async cardProjection(
    organization: OrganizationRecord,
    viewerUserId?: string,
  ) {
    const institution = await this.academic.getCatalogNode(
      organization.institutionId,
    );
    const following = viewerUserId
      ? await this.store.isFollowing(organization.id, viewerUserId)
      : false;

    return {
      id: organization.id,
      name: organization.name,
      type: organization.type,
      avatarUrl: organization.avatarUrl,
      verificationState: organization.verificationState,
      institution: {
        id: institution.node.id,
        name: institution.node.name,
      },
      ...(viewerUserId ? { viewer: { following } } : {}),
    };
  }

  private async scopeProjection(organization: OrganizationRecord) {
    const [institution, campus, academicUnit, program] = await Promise.all([
      this.academic.getCatalogNode(organization.institutionId),
      organization.campusId
        ? this.academic.getCatalogNode(organization.campusId)
        : Promise.resolve(null),
      organization.academicUnitId
        ? this.academic.getCatalogNode(organization.academicUnitId)
        : Promise.resolve(null),
      organization.programId
        ? this.academic.getCatalogNode(organization.programId)
        : Promise.resolve(null),
    ]);

    const node = (
      value: Awaited<ReturnType<AcademicService['getCatalogNode']>> | null,
    ) =>
      value
        ? {
            id: value.node.id,
            name: value.node.name,
          }
        : null;

    return {
      institution: node(institution)!,
      campus: node(campus),
      academicUnit: node(academicUnit),
      program: node(program),
    };
  }

  private async postProjection(
    post: OrganizationPostRecord,
    organization: OrganizationRecord,
  ) {
    const subject = post.subjectId
      ? await this.academic.getCatalogNode(post.subjectId)
      : null;

    return {
      id: post.id,
      title: post.title,
      body: post.body,
      source: {
        kind: 'campus_organization' as const,
        organization: {
          id: organization.id,
          name: organization.name,
          verificationState: organization.verificationState,
        },
      },
      academic: subject
        ? {
            subject: {
              id: subject.node.id,
              name: subject.node.name,
            },
          }
        : null,
      revision: post.revision,
      publishedAt: post.publishedAt.toISOString(),
      updatedAt: post.updatedAt.toISOString(),
    };
  }

  private eventProjection(event: OrganizationEventRecord) {
    return {
      id: event.id,
      title: event.title,
      description: event.description,
      startsAt: event.startsAt.toISOString(),
      endsAt: event.endsAt?.toISOString() ?? null,
      locationLabel: event.locationLabel,
      externalUrl: event.externalUrl,
      state: event.state,
      revision: event.revision,
      createdAt: event.createdAt.toISOString(),
      updatedAt: event.updatedAt.toISOString(),
    };
  }

  private linkProjection(link: {
    id: string;
    label: string;
    url: string;
  }) {
    return { id: link.id, label: link.label, url: link.url };
  }

  private async canonicalSearchFilters(dto: OrganizationSearchDto) {
    let institutionId: string | undefined;
    let programId: string | undefined;

    if (dto.institutionId && dto.programId) {
      const scope = await this.resolveScope({
        institutionId: dto.institutionId,
        programId: dto.programId,
      });
      institutionId = scope.institutionId;
      programId = scope.programId ?? undefined;
    } else if (dto.institutionId) {
      const node = await this.academic.getCatalogNode(dto.institutionId);
      if (node.node.kind !== 'institution') this.scopeInvalid();
      institutionId = node.node.id;
    } else if (dto.programId) {
      const node = await this.academic.getCatalogNode(dto.programId);
      if (node.node.kind !== 'program') this.scopeInvalid();
      programId = node.node.id;
    }

    return {
      ...(dto.q ? { q: normalizeName(dto.q) } : {}),
      ...(dto.type ? { type: dto.type } : {}),
      ...(institutionId ? { institutionId } : {}),
      ...(programId ? { programId } : {}),
    };
  }

  private async resolveScope(input: {
    institutionId: string;
    campusId?: string;
    academicUnitId?: string;
    programId?: string;
  }) {
    try {
      return await this.academic.resolveOrganizationScope(input);
    } catch (error) {
      if (error instanceof NotFoundException) this.scopeInvalid();
      if (
        error instanceof UnprocessableEntityException &&
        error.getResponse() !== undefined
      ) {
        this.scopeInvalid();
      }
      throw error;
    }
  }

  private async requireActive(id: string): Promise<OrganizationRecord> {
    const organization = await this.store.findById(id);
    if (!organization || organization.status !== 'active') this.notFound();
    return organization;
  }

  private async requireManager(
    organizationId: string,
    userId: string,
  ): Promise<OrganizationManagerRecord> {
    const manager = await this.store.findManager(organizationId, userId);
    if (!manager) {
      throw new ForbiddenException({
        code: 'ORGANIZATION_MANAGEMENT_FORBIDDEN',
        message: 'Organization management permission required',
      });
    }
    return manager;
  }

  private async requireRole(
    organizationId: string,
    userId: string,
    allowed: OrganizationManagerRole[],
  ) {
    const manager = await this.requireManager(organizationId, userId);
    if (!allowed.includes(manager.role)) {
      throw new ForbiddenException({
        code: 'ORGANIZATION_MANAGEMENT_FORBIDDEN',
        message: 'Organization management permission required',
      });
    }
    return manager;
  }

  private assertManagerMutationAllowed(
    actorRole: OrganizationManagerRole,
    currentRole: OrganizationManagerRole | null,
    nextRole: OrganizationManagerRole | null,
  ): void {
    if (
      actorRole === 'admin' &&
      (currentRole === 'owner' || nextRole === 'owner')
    ) {
      throw new ForbiddenException({
        code: 'ORGANIZATION_MANAGER_ROLE_FORBIDDEN',
        message: 'Admin cannot create, change or revoke Organization owners',
      });
    }
  }

  private assertManagerChangeResult(
    result: Awaited<ReturnType<OrganizationStore['changeManager']>>,
  ): void {
    if (result.status === 'ok') return;
    if (result.status === 'final_owner') {
      throw new ConflictException({
        code: 'ORGANIZATION_FINAL_OWNER_REQUIRED',
        message: 'Organization must retain at least one owner',
      });
    }
    this.managementConflict();
  }

  private assertEventPeriod(startsAt: Date, endsAt: Date | null): void {
    if (endsAt && endsAt < startsAt) {
      throw new UnprocessableEntityException({
        code: 'ORGANIZATION_EVENT_PERIOD_INVALID',
        message: 'Event end cannot be before event start',
      });
    }
  }

  private audit(
    input: Omit<OrganizationAuditRecord, 'id' | 'createdAt'>,
  ): OrganizationAuditRecord {
    return {
      id: randomUUID(),
      ...input,
      createdAt: new Date(),
    };
  }

  private notFound(): never {
    throw new NotFoundException({
      code: 'ORGANIZATION_NOT_FOUND',
      message: 'Organization was not found',
    });
  }

  private scopeInvalid(): never {
    throw new UnprocessableEntityException({
      code: 'ORGANIZATION_SCOPE_INVALID',
      message: 'Organization academic scope is invalid',
    });
  }

  private revisionConflict(): never {
    throw new ConflictException({
      code: 'ORGANIZATION_REVISION_CONFLICT',
      message: 'Organization changed concurrently',
    });
  }

  private managementConflict(): never {
    throw new ConflictException({
      code: 'ORGANIZATION_MANAGEMENT_REVISION_CONFLICT',
      message: 'Organization management changed concurrently',
    });
  }
}
