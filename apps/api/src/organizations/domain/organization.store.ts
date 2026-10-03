import type {
  OrganizationAuditRecord,
  OrganizationCursor,
  OrganizationEventCursor,
  OrganizationEventRecord,
  OrganizationFeaturedResourceRecord,
  OrganizationFollowRecord,
  OrganizationLinkRecord,
  OrganizationManagerRecord,
  OrganizationManagerRole,
  OrganizationPostCursor,
  OrganizationPostRecord,
  OrganizationRecord,
  OrganizationReportReason,
  OrganizationReportRecord,
  OrganizationType,
  OrganizationVerificationState,
} from './organization.types';

export const ORGANIZATION_STORE = Symbol('ORGANIZATION_STORE');

export type CreateOrganizationRecord = Omit<
  OrganizationRecord,
  'createdAt' | 'updatedAt'
>;

export type UpdateOrganizationRecord = Partial<
  Pick<
    OrganizationRecord,
    | 'name'
    | 'normalizedName'
    | 'about'
    | 'avatarUrl'
    | 'coverUrl'
    | 'websiteUrl'
  >
>;

export class OrganizationManagerTargetInactiveError extends Error {
  constructor() {
    super('Organization manager target account is inactive');
    this.name = 'OrganizationManagerTargetInactiveError';
  }
}

export type ManagerChangeResult =
  | {
      status: 'ok';
      manager: OrganizationManagerRecord | null;
      managementRevision: number;
    }
  | { status: 'revision_conflict' }
  | { status: 'target_state_conflict' }
  | { status: 'final_owner' }
  | { status: 'manager_limit' }
  | { status: 'target_inactive' };

export type OrganizationWriteAuthority = {
  actorUserId: string;
  expectedManagementRevision: number;
  allowedRoles: readonly OrganizationManagerRole[];
};

export type AuthorizedOrganizationMutation =
  | {
      kind: 'organization.update';
      expectedRevision: number;
      patch: UpdateOrganizationRecord;
    }
  | {
      kind: 'post.create';
      record: Omit<OrganizationPostRecord, 'createdAt' | 'updatedAt'>;
    }
  | {
      kind: 'post.update';
      postId: string;
      expectedRevision: number;
      patch: Partial<
        Pick<OrganizationPostRecord, 'title' | 'body' | 'subjectId'>
      >;
    }
  | { kind: 'post.delete'; postId: string }
  | {
      kind: 'event.create';
      record: Omit<OrganizationEventRecord, 'createdAt' | 'updatedAt'>;
    }
  | {
      kind: 'event.update';
      eventId: string;
      expectedRevision: number;
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
      >;
    }
  | {
      kind: 'link.create';
      record: Omit<OrganizationLinkRecord, 'createdAt' | 'updatedAt'>;
    }
  | { kind: 'link.delete'; linkId: string }
  | {
      kind: 'resource.feature';
      resourceId: string;
      createdByUserId: string;
    }
  | { kind: 'resource.unfeature'; resourceId: string };

export type AuthorizedOrganizationMutationResult =
  | { status: 'authority_stale' }
  | { status: 'state_conflict' }
  | { status: 'not_found' }
  | { status: 'collection_limit'; collection: 'links' | 'featured_resources' }
  | { status: 'ok'; kind: 'organization.update'; value: OrganizationRecord }
  | { status: 'ok'; kind: 'post.create'; value: OrganizationPostRecord }
  | { status: 'ok'; kind: 'post.update'; value: OrganizationPostRecord }
  | { status: 'ok'; kind: 'post.delete'; value: true }
  | { status: 'ok'; kind: 'event.create'; value: OrganizationEventRecord }
  | { status: 'ok'; kind: 'event.update'; value: OrganizationEventRecord }
  | { status: 'ok'; kind: 'link.create'; value: OrganizationLinkRecord }
  | { status: 'ok'; kind: 'link.delete'; value: true }
  | {
      status: 'ok';
      kind: 'resource.feature';
      value: OrganizationFeaturedResourceRecord;
    }
  | { status: 'ok'; kind: 'resource.unfeature'; value: true };

export interface OrganizationStore {
  createWithOwner(input: {
    organization: CreateOrganizationRecord;
    ownerUserId: string;
    audit: OrganizationAuditRecord;
  }): Promise<{
    organization: OrganizationRecord;
    owner: OrganizationManagerRecord;
  }>;

  findById(id: string): Promise<OrganizationRecord | null>;
  findManyByIds(ids: string[]): Promise<OrganizationRecord[]>;
  search(input: {
    q?: string;
    type?: OrganizationType;
    institutionId?: string;
    programId?: string;
    limit: number;
    after?: OrganizationCursor;
  }): Promise<{ items: OrganizationRecord[]; hasMore: boolean }>;

  commitAuthorizedMutation(input: {
    organizationId: string;
    authority: OrganizationWriteAuthority;
    mutation: AuthorizedOrganizationMutation;
    audit: OrganizationAuditRecord;
  }): Promise<AuthorizedOrganizationMutationResult>;

  updateVerification(input: {
    organizationId: string;
    expectedRevision: number;
    verificationState: OrganizationVerificationState;
    audit: OrganizationAuditRecord;
  }): Promise<OrganizationRecord | null>;

  findManager(
    organizationId: string,
    userId: string,
  ): Promise<OrganizationManagerRecord | null>;
  listManagers(organizationId: string): Promise<OrganizationManagerRecord[]>;
  changeManager(input: {
    organizationId: string;
    actorUserId: string;
    targetUserId: string;
    expectedManagementRevision: number;
    expectedTargetRole: OrganizationManagerRole | null;
    nextRole: OrganizationManagerRole | null;
    audit: OrganizationAuditRecord;
  }): Promise<ManagerChangeResult>;

  follow(
    organizationId: string,
    userId: string,
  ): Promise<{ follow: OrganizationFollowRecord; created: boolean }>;
  unfollow(organizationId: string, userId: string): Promise<void>;
  isFollowing(organizationId: string, userId: string): Promise<boolean>;
  countFollowers(organizationId: string): Promise<number>;
  listFollowedOrganizationIds(
    userId: string,
    limit: number,
  ): Promise<{ ids: string[]; truncated: boolean }>;

  findPostById(
    organizationId: string,
    postId: string,
  ): Promise<OrganizationPostRecord | null>;
  findPostByGlobalId(postId: string): Promise<OrganizationPostRecord | null>;
  listPosts(input: {
    organizationId: string;
    limit: number;
    before?: Date;
    after?: OrganizationPostCursor;
  }): Promise<{ items: OrganizationPostRecord[]; hasMore: boolean }>;
  listFeedPosts(input: {
    organizationIds: string[];
    anchorAt: Date;
    limit: number;
  }): Promise<OrganizationPostRecord[]>;
  listFeedPostsForFollower(input: {
    userId: string;
    anchorAt: Date;
    limit: number;
  }): Promise<OrganizationPostRecord[]>;

  findEventById(
    organizationId: string,
    eventId: string,
  ): Promise<OrganizationEventRecord | null>;
  listEvents(input: {
    organizationId: string;
    limit: number;
    from?: Date;
    after?: OrganizationEventCursor;
  }): Promise<{ items: OrganizationEventRecord[]; hasMore: boolean }>;

  listLinks(organizationId: string): Promise<OrganizationLinkRecord[]>;

  listFeaturedResources(
    organizationId: string,
  ): Promise<OrganizationFeaturedResourceRecord[]>;

  upsertPendingReport(input: {
    id: string;
    targetType: 'organization_post' | 'organization_event';
    targetId: string;
    reporterUserId: string;
    reason: OrganizationReportReason;
    details: string | null;
  }): Promise<OrganizationReportRecord>;
}
