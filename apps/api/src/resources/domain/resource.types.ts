export const RESOURCE_VISIBILITIES = ['private', 'shared', 'public'] as const;
export type ResourceVisibility = (typeof RESOURCE_VISIBILITIES)[number];

export const RESOURCE_MODERATION_STATES = ['available', 'hidden'] as const;
export type ResourceModerationState =
  (typeof RESOURCE_MODERATION_STATES)[number];

export const RESOURCE_REPORT_REASONS = [
  'spam',
  'plagiarism',
  'copyright',
  'honor_code',
  'inappropriate',
  'other',
] as const;
export type ResourceReportReason = (typeof RESOURCE_REPORT_REASONS)[number];

export const RESOURCE_REPORT_STATUSES = [
  'pending',
  'resolved',
  'dismissed',
] as const;
export type ResourceReportStatus = (typeof RESOURCE_REPORT_STATUSES)[number];

export interface ResourceRecord {
  id: string;
  authorUserId: string;
  assetId: string;
  title: string;
  description: string | null;
  tags: string[];
  searchText: string;
  subjectId: string;
  courseOfferingId: string | null;
  visibility: ResourceVisibility;
  moderationState: ResourceModerationState;
  revision: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface ResourceShareRecord {
  resourceId: string;
  userId: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface ResourceSaveRecord {
  resourceId: string;
  userId: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface ResourceReportRecord {
  id: string;
  resourceId: string;
  reporterUserId: string;
  reason: ResourceReportReason;
  details: string | null;
  status: ResourceReportStatus;
  reviewedByUserId?: string;
  reviewedAt?: Date;
  reviewReason?: string;
  reviewAction?: 'hide' | 'restore' | 'dismiss';
  createdAt: Date;
  updatedAt: Date;
}

export interface ResourceSearchCursor {
  updatedAt: Date;
  id: string;
}
