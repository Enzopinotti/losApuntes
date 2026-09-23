import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';

import {
  ACADEMIC_NODE_KINDS,
  type AcademicAffiliationStatus,
  type AcademicAuditEventRecord,
  type AcademicAuthorityTier,
  type AcademicNodeKind,
  type AcademicNodeStatus,
  type AcademicProposalStatus,
  type SubjectParticipationState,
} from '../domain/academic.types';

@Schema({ collection: 'academic_catalog_nodes', timestamps: true })
export class AcademicCatalogNode {
  @Prop({ required: true, unique: true, index: true })
  id!: string;

  @Prop({ required: true, enum: ACADEMIC_NODE_KINDS, index: true })
  kind!: AcademicNodeKind;

  @Prop({ required: true })
  name!: string;

  @Prop({ required: true, index: true })
  normalizedName!: string;

  @Prop({ type: [String], default: [] })
  aliases!: string[];

  @Prop({ type: [String], default: [] })
  normalizedAliases!: string[];

  @Prop({ type: [String], default: [], index: true })
  parentIds!: string[];

  @Prop({
    required: true,
    enum: ['active', 'inactive', 'merged'],
    default: 'active',
    index: true,
  })
  status!: AcademicNodeStatus;

  @Prop()
  redirectToId?: string;

  @Prop({
    required: true,
    type: {
      authorityTier: {
        type: String,
        required: true,
        enum: ['A', 'B', 'C', 'D'],
      },
      sourceKey: { type: String, required: true },
      sourceUrl: { type: String, required: true },
      externalId: { type: String, required: false },
      sourceObservedName: { type: String, required: false },
      sourceFingerprint: { type: String, required: false },
      verifiedAt: { type: Date, required: false },
    },
  })
  provenance!: {
    authorityTier: AcademicAuthorityTier;
    sourceKey: string;
    sourceUrl: string;
    externalId?: string;
    sourceObservedName?: string;
    sourceFingerprint?: string;
    verifiedAt?: Date;
  };

  @Prop({ required: true, min: 1, default: 1 })
  revision!: number;

  createdAt!: Date;
  updatedAt!: Date;
}

export const AcademicCatalogNodeSchema =
  SchemaFactory.createForClass(AcademicCatalogNode);

AcademicCatalogNodeSchema.index({
  status: 1,
  kind: 1,
  normalizedName: 1,
  id: 1,
});
AcademicCatalogNodeSchema.index({ parentIds: 1, status: 1, kind: 1 });
AcademicCatalogNodeSchema.index(
  { 'provenance.sourceKey': 1, 'provenance.externalId': 1 },
  {
    unique: true,
    partialFilterExpression: {
      'provenance.externalId': { $type: 'string' },
    },
  },
);

@Schema({ collection: 'academic_affiliations', timestamps: true })
export class AcademicAffiliation {
  @Prop({ required: true, unique: true, index: true })
  id!: string;

  @Prop({ required: true, index: true })
  userId!: string;

  @Prop({ required: true, index: true })
  institutionId!: string;

  @Prop()
  campusId?: string;

  @Prop()
  academicUnitId?: string;

  @Prop()
  programId?: string;

  @Prop()
  curriculumId?: string;

  @Prop({
    required: true,
    enum: ['applicant', 'active', 'paused', 'completed', 'withdrawn', 'alumni'],
    index: true,
  })
  status!: AcademicAffiliationStatus;

  @Prop()
  startedOn?: string;

  @Prop()
  endedOn?: string;

  createdAt!: Date;
  updatedAt!: Date;
}

export const AcademicAffiliationSchema =
  SchemaFactory.createForClass(AcademicAffiliation);
AcademicAffiliationSchema.index({ userId: 1, updatedAt: -1 });

@Schema({ collection: 'academic_subject_participations', timestamps: true })
export class AcademicSubjectParticipation {
  @Prop({ required: true, unique: true, index: true })
  id!: string;

  @Prop({ required: true, index: true })
  userId!: string;

  @Prop({ required: true, index: true })
  subjectId!: string;

  @Prop({ type: String, default: null, index: true })
  courseOfferingId?: string | null;

  @Prop({
    required: true,
    enum: ['planned', 'current', 'completed', 'dropped'],
  })
  state!: SubjectParticipationState;

  @Prop()
  periodLabel?: string;

  createdAt!: Date;
  updatedAt!: Date;
}

export const AcademicSubjectParticipationSchema = SchemaFactory.createForClass(
  AcademicSubjectParticipation,
);
AcademicSubjectParticipationSchema.index(
  { userId: 1, subjectId: 1, courseOfferingId: 1 },
  { unique: true },
);

@Schema({ collection: 'academic_current_contexts', timestamps: true })
export class AcademicCurrentContext {
  @Prop({ required: true, unique: true, index: true })
  userId!: string;

  @Prop({ required: true })
  affiliationId!: string;

  @Prop()
  subjectParticipationId?: string;

  createdAt!: Date;
  updatedAt!: Date;
}

export const AcademicCurrentContextSchema = SchemaFactory.createForClass(
  AcademicCurrentContext,
);

@Schema({ collection: 'academic_catalog_proposals', timestamps: true })
export class AcademicCatalogProposal {
  @Prop({ required: true, unique: true, index: true })
  id!: string;

  @Prop({ required: true, index: true })
  userId!: string;

  @Prop({ required: true, enum: ACADEMIC_NODE_KINDS, index: true })
  kind!: AcademicNodeKind;

  @Prop({ required: true })
  proposedName!: string;

  @Prop({ type: [String], default: [] })
  parentIds!: string[];

  @Prop()
  evidenceUrl?: string;

  @Prop()
  notes?: string;

  @Prop({
    required: true,
    enum: ['pending', 'accepted', 'rejected', 'duplicate', 'superseded'],
    default: 'pending',
    index: true,
  })
  status!: AcademicProposalStatus;

  @Prop()
  reviewedByUserId?: string;

  @Prop()
  reviewReason?: string;

  @Prop()
  canonicalTargetId?: string;

  @Prop()
  reviewedAt?: Date;

  createdAt!: Date;
  updatedAt!: Date;
}

export const AcademicCatalogProposalSchema = SchemaFactory.createForClass(
  AcademicCatalogProposal,
);
AcademicCatalogProposalSchema.index({ userId: 1, createdAt: -1 });
AcademicCatalogProposalSchema.index({ status: 1, createdAt: 1, id: 1 });

@Schema({ collection: 'academic_audit_events', timestamps: false })
export class AcademicAuditEvent {
  @Prop({ required: true, unique: true, index: true })
  id!: string;

  @Prop({ required: true, index: true })
  event!: AcademicAuditEventRecord['event'];

  @Prop({ required: true, index: true })
  actorUserId!: string;

  @Prop({ required: true, index: true })
  targetId!: string;

  @Prop({ type: Object })
  metadata?: Record<string, string | number | boolean | null>;

  @Prop({ required: true, index: true })
  createdAt!: Date;
}

export const AcademicAuditEventSchema =
  SchemaFactory.createForClass(AcademicAuditEvent);
AcademicAuditEventSchema.index({ targetId: 1, createdAt: -1 });
