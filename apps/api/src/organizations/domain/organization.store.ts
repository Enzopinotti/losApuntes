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

export type ManagerChangeResult =
  | {
      status: 'ok';
      manager: OrganizationManagerRecord | null;
      managementRevision: number;
    }
  | { status: 'revision_conflict' }
  | { status: 'target_state_conflict' }
  | { status: 'final_owner' };

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

  updateOwnedProfile(input: {
    organizationId: string;
    expectedRevision: number;
    patch: UpdateOrganizationRecord;
    audit: OrganizationAuditRecord;
  }): Promise<OrganizationRecord | null>;

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

  createPost(
    input: Omit<OrganizationPostRecord, 'createdAt' | 'updatedAt'>,
  ): Promise<OrganizationPostRecord>;
  findPostById(
    organizationId: string,
    postId: string,
  ): Promise<OrganizationPostRecord | null>;
  findPostByGlobalId(postId: string): Promise<OrganizationPostRecord | null>;
  updatePost(
    organizationId: string,
    postId: string,
    expectedRevision: number,
    patch: Partial<
      Pick<OrganizationPostRecord, 'title' | 'body' | 'subjectId'>
    >,
  ): Promise<OrganizationPostRecord | null>;
  deletePost(organizationId: string, postId: string): Promise<boolean>;
  listPosts(input: {
    organizationId: string;
    limit: number;
    before?: Date;
  }): Promise<OrganizationPostRecord[]>;
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

  createEvent(
    input: Omit<OrganizationEventRecord, 'createdAt' | 'updatedAt'>,
  ): Promise<OrganizationEventRecord>;
  findEventById(
    organizationId: string,
    eventId: string,
  ): Promise<OrganizationEventRecord | null>;
  updateEvent(
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
  ): Promise<OrganizationEventRecord | null>;
  listEvents(input: {
    organizationId: string;
    limit: number;
    from?: Date;
  }): Promise<OrganizationEventRecord[]>;

  createLink(
    input: Omit<OrganizationLinkRecord, 'createdAt' | 'updatedAt'>,
  ): Promise<OrganizationLinkRecord>;
  deleteLink(
    organizationId: string,
    linkId: string,
  ): Promise<boolean>;
  listLinks(organizationId: string): Promise<OrganizationLinkRecord[]>;

  featureResource(input: {
    organizationId: string;
    resourceId: string;
    createdByUserId: string;
  }): Promise<OrganizationFeaturedResourceRecord>;
  unfeatureResource(
    organizationId: string,
    resourceId: string,
  ): Promise<void>;
  listFeaturedResources(
    organizationId: string,
  ): Promise<OrganizationFeaturedResourceRecord[]>;
}
