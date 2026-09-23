import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';

import {
  RESOURCE_MODERATION_STATES,
  RESOURCE_REPORT_REASONS,
  RESOURCE_REPORT_STATUSES,
  RESOURCE_VISIBILITIES,
  type ResourceModerationState,
  type ResourceReportReason,
  type ResourceReportStatus,
  type ResourceVisibility,
} from '../domain/resource.types';

@Schema({ collection: 'resources', timestamps: true })
export class Resource {
  @Prop({ required: true, unique: true, index: true })
  id!: string;

  @Prop({ required: true, index: true })
  authorUserId!: string;

  @Prop({ required: true, unique: true, index: true })
  assetId!: string;

  @Prop({ required: true })
  title!: string;

  @Prop({ type: String, default: null })
  description!: string | null;

  @Prop({ type: [String], default: [] })
  tags!: string[];

  @Prop({ required: true })
  searchText!: string;

  @Prop({ required: true, index: true })
  subjectId!: string;

  @Prop({ type: String, default: null, index: true })
  courseOfferingId!: string | null;

  @Prop({ required: true, enum: RESOURCE_VISIBILITIES, index: true })
  visibility!: ResourceVisibility;

  @Prop({
    required: true,
    enum: RESOURCE_MODERATION_STATES,
    default: 'available',
    index: true,
  })
  moderationState!: ResourceModerationState;

  @Prop({ required: true, min: 1, default: 1 })
  revision!: number;

  createdAt!: Date;
  updatedAt!: Date;
}

export const ResourceSchema = SchemaFactory.createForClass(Resource);
ResourceSchema.index({
  subjectId: 1,
  moderationState: 1,
  updatedAt: -1,
  id: 1,
});
ResourceSchema.index({
  visibility: 1,
  moderationState: 1,
  updatedAt: -1,
  id: 1,
});
ResourceSchema.index({ authorUserId: 1, updatedAt: -1, id: 1 });

@Schema({ collection: 'resource_shares', timestamps: true })
export class ResourceShare {
  @Prop({ required: true, index: true })
  resourceId!: string;

  @Prop({ required: true, index: true })
  userId!: string;

  createdAt!: Date;
  updatedAt!: Date;
}

export const ResourceShareSchema = SchemaFactory.createForClass(ResourceShare);
ResourceShareSchema.index({ resourceId: 1, userId: 1 }, { unique: true });
ResourceShareSchema.index({ userId: 1, createdAt: -1 });

@Schema({ collection: 'resource_saves', timestamps: true })
export class ResourceSave {
  @Prop({ required: true, index: true })
  resourceId!: string;

  @Prop({ required: true, index: true })
  userId!: string;

  createdAt!: Date;
  updatedAt!: Date;
}

export const ResourceSaveSchema = SchemaFactory.createForClass(ResourceSave);
ResourceSaveSchema.index({ userId: 1, resourceId: 1 }, { unique: true });
ResourceSaveSchema.index({ userId: 1, createdAt: -1 });

@Schema({ collection: 'resource_reports', timestamps: true })
export class ResourceReport {
  @Prop({ required: true, unique: true, index: true })
  id!: string;

  @Prop({ required: true, index: true })
  resourceId!: string;

  @Prop({ required: true, index: true })
  reporterUserId!: string;

  @Prop({ required: true, enum: RESOURCE_REPORT_REASONS })
  reason!: ResourceReportReason;

  @Prop({ type: String, default: null })
  details!: string | null;

  @Prop({
    required: true,
    enum: RESOURCE_REPORT_STATUSES,
    default: 'pending',
    index: true,
  })
  status!: ResourceReportStatus;

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

export const ResourceReportSchema =
  SchemaFactory.createForClass(ResourceReport);
ResourceReportSchema.index(
  { resourceId: 1, reporterUserId: 1, status: 1 },
  { unique: true },
);
ResourceReportSchema.index({ status: 1, createdAt: 1, id: 1 });
