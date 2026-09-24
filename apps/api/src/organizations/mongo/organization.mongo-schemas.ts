import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';

import {
  ORGANIZATION_AUDIT_EVENTS,
  ORGANIZATION_EVENT_STATES,
  ORGANIZATION_MANAGER_ROLES,
  ORGANIZATION_REPORT_REASONS,
  ORGANIZATION_TYPES,
  ORGANIZATION_VERIFICATION_STATES,
  type OrganizationAuditEvent,
  type OrganizationEventState,
  type OrganizationManagerRole,
  type OrganizationReportReason,
  type OrganizationType,
  type OrganizationVerificationState,
} from '../domain/organization.types';

@Schema({ collection: 'organizations', timestamps: true })
export class Organization {
  @Prop({ required: true, unique: true, index: true })
  id!: string;

  @Prop({ required: true })
  name!: string;

  @Prop({ required: true, index: true })
  normalizedName!: string;

  @Prop({ required: true, enum: ORGANIZATION_TYPES, index: true })
  type!: OrganizationType;

  @Prop({ type: String, default: null })
  about!: string | null;

  @Prop({ type: String, default: null })
  avatarUrl!: string | null;

  @Prop({ type: String, default: null })
  coverUrl!: string | null;

  @Prop({ type: String, default: null })
  websiteUrl!: string | null;

  @Prop({ required: true, index: true })
  institutionId!: string;

  @Prop({ type: String, default: null, index: true })
  campusId!: string | null;

  @Prop({ type: String, default: null, index: true })
  academicUnitId!: string | null;

  @Prop({ type: String, default: null, index: true })
  programId!: string | null;

  @Prop({ required: true, enum: ['claimed', 'unclaimed'] })
  claimState!: 'claimed' | 'unclaimed';

  @Prop({
    required: true,
    enum: ORGANIZATION_VERIFICATION_STATES,
    index: true,
  })
  verificationState!: OrganizationVerificationState;

  @Prop({ required: true, enum: ['active', 'archived'], index: true })
  status!: 'active' | 'archived';

  @Prop({ required: true, min: 1 })
  revision!: number;

  @Prop({ required: true, min: 1 })
  managementRevision!: number;

  createdAt!: Date;
  updatedAt!: Date;
}

export const OrganizationSchema = SchemaFactory.createForClass(Organization);
OrganizationSchema.index({
  institutionId: 1,
  status: 1,
  normalizedName: 1,
  id: 1,
});

@Schema({ collection: 'organization_managers', timestamps: true })
export class OrganizationManager {
  @Prop({ required: true, index: true })
  organizationId!: string;

  @Prop({ required: true, index: true })
  userId!: string;

  @Prop({ required: true, enum: ORGANIZATION_MANAGER_ROLES })
  role!: OrganizationManagerRole;

  createdAt!: Date;
  updatedAt!: Date;
}

export const OrganizationManagerSchema =
  SchemaFactory.createForClass(OrganizationManager);
OrganizationManagerSchema.index(
  { organizationId: 1, userId: 1 },
  { unique: true },
);
OrganizationManagerSchema.index({ userId: 1, organizationId: 1 });

@Schema({ collection: 'organization_audit' })
export class OrganizationAudit {
  @Prop({ required: true, unique: true, index: true })
  id!: string;

  @Prop({ required: true, index: true })
  organizationId!: string;

  @Prop({ required: true, enum: ORGANIZATION_AUDIT_EVENTS, index: true })
  event!: OrganizationAuditEvent;

  @Prop({ required: true, index: true })
  actorUserId!: string;

  @Prop({ type: String, default: null, index: true })
  targetUserId!: string | null;

  @Prop({ type: String, enum: ORGANIZATION_MANAGER_ROLES, default: null })
  previousRole!: OrganizationManagerRole | null;

  @Prop({ type: String, enum: ORGANIZATION_MANAGER_ROLES, default: null })
  nextRole!: OrganizationManagerRole | null;

  @Prop({ required: true })
  reason!: string;

  @Prop({ type: Object, default: {} })
  metadata!: Record<string, string | number | boolean | null>;

  @Prop({ required: true, type: Date, index: true })
  createdAt!: Date;
}

export const OrganizationAuditSchema =
  SchemaFactory.createForClass(OrganizationAudit);

@Schema({ collection: 'organization_follows', timestamps: true })
export class OrganizationFollow {
  @Prop({ required: true, index: true })
  organizationId!: string;

  @Prop({ required: true, index: true })
  userId!: string;

  createdAt!: Date;
  updatedAt!: Date;
}

export const OrganizationFollowSchema =
  SchemaFactory.createForClass(OrganizationFollow);
OrganizationFollowSchema.index(
  { organizationId: 1, userId: 1 },
  { unique: true },
);
OrganizationFollowSchema.index({ userId: 1, createdAt: -1 });

@Schema({ collection: 'organization_posts', timestamps: true })
export class OrganizationPost {
  @Prop({ required: true, unique: true, index: true })
  id!: string;

  @Prop({ required: true, index: true })
  organizationId!: string;

  @Prop({ required: true, index: true })
  createdByUserId!: string;

  @Prop({ type: String, default: null })
  title!: string | null;

  @Prop({ required: true })
  body!: string;

  @Prop({ type: String, default: null, index: true })
  subjectId!: string | null;

  @Prop({
    required: true,
    enum: ['available', 'hidden'],
    default: 'available',
    index: true,
  })
  moderationState!: 'available' | 'hidden';

  @Prop({ required: true, min: 1 })
  revision!: number;

  @Prop({ required: true, type: Date, index: true })
  publishedAt!: Date;

  createdAt!: Date;
  updatedAt!: Date;
}

export const OrganizationPostSchema =
  SchemaFactory.createForClass(OrganizationPost);
OrganizationPostSchema.index({
  organizationId: 1,
  moderationState: 1,
  publishedAt: -1,
  id: 1,
});

@Schema({ collection: 'organization_events', timestamps: true })
export class OrganizationEvent {
  @Prop({ required: true, unique: true, index: true })
  id!: string;

  @Prop({ required: true, index: true })
  organizationId!: string;

  @Prop({ required: true, index: true })
  createdByUserId!: string;

  @Prop({ required: true })
  title!: string;

  @Prop({ type: String, default: null })
  description!: string | null;

  @Prop({ required: true, type: Date, index: true })
  startsAt!: Date;

  @Prop({ type: Date, default: null })
  endsAt!: Date | null;

  @Prop({ type: String, default: null })
  locationLabel!: string | null;

  @Prop({ type: String, default: null })
  externalUrl!: string | null;

  @Prop({ required: true, enum: ORGANIZATION_EVENT_STATES, index: true })
  state!: OrganizationEventState;

  @Prop({ required: true, min: 1 })
  revision!: number;

  createdAt!: Date;
  updatedAt!: Date;
}

export const OrganizationEventSchema =
  SchemaFactory.createForClass(OrganizationEvent);
OrganizationEventSchema.index({
  organizationId: 1,
  startsAt: 1,
  id: 1,
});

@Schema({ collection: 'organization_links', timestamps: true })
export class OrganizationLink {
  @Prop({ required: true, unique: true, index: true })
  id!: string;

  @Prop({ required: true, index: true })
  organizationId!: string;

  @Prop({ required: true, index: true })
  createdByUserId!: string;

  @Prop({ required: true })
  label!: string;

  @Prop({ required: true })
  url!: string;

  createdAt!: Date;
  updatedAt!: Date;
}

export const OrganizationLinkSchema =
  SchemaFactory.createForClass(OrganizationLink);

@Schema({ collection: 'organization_featured_resources', timestamps: true })
export class OrganizationFeaturedResource {
  @Prop({ required: true, index: true })
  organizationId!: string;

  @Prop({ required: true, index: true })
  resourceId!: string;

  @Prop({ required: true, index: true })
  createdByUserId!: string;

  createdAt!: Date;
  updatedAt!: Date;
}

export const OrganizationFeaturedResourceSchema =
  SchemaFactory.createForClass(OrganizationFeaturedResource);
OrganizationFeaturedResourceSchema.index(
  { organizationId: 1, resourceId: 1 },
  { unique: true },
);


@Schema({ collection: 'organization_reports', timestamps: true })
export class OrganizationReport {
  @Prop({ required: true, unique: true, index: true })
  id!: string;

  @Prop({
    required: true,
    enum: ['organization_post', 'organization_event'],
    index: true,
  })
  targetType!: 'organization_post' | 'organization_event';

  @Prop({ required: true, index: true })
  targetId!: string;

  @Prop({ required: true, index: true })
  reporterUserId!: string;

  @Prop({ required: true, enum: ORGANIZATION_REPORT_REASONS })
  reason!: OrganizationReportReason;

  @Prop({ type: String, default: null })
  details!: string | null;

  @Prop({
    required: true,
    enum: ['pending', 'resolved', 'dismissed'],
    default: 'pending',
    index: true,
  })
  status!: 'pending' | 'resolved' | 'dismissed';

  @Prop()
  reviewedByUserId?: string;

  @Prop({ type: Date })
  reviewedAt?: Date;

  @Prop()
  reviewReason?: string;

  @Prop({ enum: ['hide', 'restore', 'dismiss'] })
  reviewAction?: 'hide' | 'restore' | 'dismiss';

  createdAt!: Date;
  updatedAt!: Date;
}

export const OrganizationReportSchema =
  SchemaFactory.createForClass(OrganizationReport);
OrganizationReportSchema.index(
  { targetType: 1, targetId: 1, reporterUserId: 1, status: 1 },
  { unique: true },
);
OrganizationReportSchema.index({ status: 1, createdAt: 1, id: 1 });
