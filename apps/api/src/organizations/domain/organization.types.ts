export const ORGANIZATION_TYPES = [
  'student_center',
  'association',
  'club',
  'lab',
  'research_group',
  'alumni_association',
  'incubator',
  'cultural_sports',
  'career_community',
] as const;

export type OrganizationType = (typeof ORGANIZATION_TYPES)[number];

export const ORGANIZATION_MANAGER_ROLES = ['owner', 'admin', 'editor'] as const;
export type OrganizationManagerRole =
  (typeof ORGANIZATION_MANAGER_ROLES)[number];

export const ORGANIZATION_VERIFICATION_STATES = [
  'unverified',
  'verified',
] as const;
export type OrganizationVerificationState =
  (typeof ORGANIZATION_VERIFICATION_STATES)[number];

export const ORGANIZATION_EVENT_STATES = ['scheduled', 'cancelled'] as const;

export const ORGANIZATION_REPORT_REASONS = [
  'spam',
  'impersonation',
  'misinformation',
  'harassment',
  'inappropriate',
  'other',
] as const;
export type OrganizationReportReason =
  (typeof ORGANIZATION_REPORT_REASONS)[number];
export type OrganizationEventState = (typeof ORGANIZATION_EVENT_STATES)[number];

export interface OrganizationRecord {
  id: string;
  name: string;
  normalizedName: string;
  type: OrganizationType;
  about: string | null;
  avatarUrl: string | null;
  coverUrl: string | null;
  websiteUrl: string | null;
  institutionId: string;
  campusId: string | null;
  academicUnitId: string | null;
  programId: string | null;
  claimState: 'claimed' | 'unclaimed';
  verificationState: OrganizationVerificationState;
  status: 'active' | 'archived';
  revision: number;
  managementRevision: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface OrganizationManagerRecord {
  organizationId: string;
  userId: string;
  role: OrganizationManagerRole;
  createdAt: Date;
  updatedAt: Date;
}

export const ORGANIZATION_AUDIT_EVENTS = [
  'organization.created',
  'organization.updated',
  'organization.verification_updated',
  'organization.manager_granted',
  'organization.manager_changed',
  'organization.manager_revoked',
] as const;
export type OrganizationAuditEvent = (typeof ORGANIZATION_AUDIT_EVENTS)[number];

export interface OrganizationAuditRecord {
  id: string;
  organizationId: string;
  event: OrganizationAuditEvent;
  actorUserId: string;
  targetUserId: string | null;
  previousRole: OrganizationManagerRole | null;
  nextRole: OrganizationManagerRole | null;
  reason: string;
  metadata: Record<string, string | number | boolean | null>;
  createdAt: Date;
}

export interface OrganizationFollowRecord {
  organizationId: string;
  userId: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface OrganizationPostRecord {
  id: string;
  organizationId: string;
  createdByUserId: string;
  title: string | null;
  body: string;
  subjectId: string | null;
  moderationState: 'available' | 'hidden';
  revision: number;
  publishedAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

export interface OrganizationEventRecord {
  id: string;
  organizationId: string;
  createdByUserId: string;
  title: string;
  description: string | null;
  startsAt: Date;
  endsAt: Date | null;
  locationLabel: string | null;
  externalUrl: string | null;
  state: OrganizationEventState;
  moderationState: 'available' | 'hidden';
  revision: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface OrganizationLinkRecord {
  id: string;
  organizationId: string;
  createdByUserId: string;
  label: string;
  url: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface OrganizationReportRecord {
  id: string;
  targetType: 'organization_post' | 'organization_event';
  targetId: string;
  reporterUserId: string;
  reason: OrganizationReportReason;
  details: string | null;
  status: 'pending' | 'resolved' | 'dismissed';
  reviewedByUserId?: string;
  reviewedAt?: Date;
  reviewReason?: string;
  reviewAction?: 'hide' | 'restore' | 'dismiss';
  createdAt: Date;
  updatedAt: Date;
}

export interface OrganizationFeaturedResourceRecord {
  organizationId: string;
  resourceId: string;
  createdByUserId: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface OrganizationCursor {
  normalizedName: string;
  id: string;
}
