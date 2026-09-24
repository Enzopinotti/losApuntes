export const ACADEMIC_NODE_KINDS = [
  'country',
  'institution',
  'campus',
  'academic_unit',
  'program',
  'curriculum',
  'subject',
  'course_offering',
] as const;

export type AcademicNodeKind = (typeof ACADEMIC_NODE_KINDS)[number];
export type AcademicNodeStatus = 'active' | 'inactive' | 'merged';
export type AcademicAuthorityTier = 'A' | 'B' | 'C' | 'D';

export const ACADEMIC_PARENT_KINDS: Record<
  AcademicNodeKind,
  readonly AcademicNodeKind[]
> = {
  country: [],
  institution: ['country'],
  campus: ['institution'],
  academic_unit: ['institution', 'campus'],
  program: ['institution', 'campus', 'academic_unit'],
  curriculum: ['program'],
  subject: ['program', 'curriculum'],
  course_offering: ['subject'],
};

export type AcademicSourceProvenance = {
  authorityTier: AcademicAuthorityTier;
  sourceKey: string;
  sourceUrl: string;
  externalId?: string;
  sourceObservedName?: string;
  sourceFingerprint?: string;
  verifiedAt?: Date;
};

export type AcademicCatalogNodeRecord = {
  id: string;
  kind: AcademicNodeKind;
  name: string;
  normalizedName: string;
  aliases: string[];
  normalizedAliases: string[];
  parentIds: string[];
  status: AcademicNodeStatus;
  redirectToId?: string;
  provenance: AcademicSourceProvenance;
  revision: number;
  createdAt: Date;
  updatedAt: Date;
};

export type AcademicAffiliationStatus =
  'applicant' | 'active' | 'paused' | 'completed' | 'withdrawn' | 'alumni';

export const ACADEMIC_RELATIONSHIP_ROLES = [
  'student',
  'advanced_student',
  'recent_graduate',
  'alumni',
  'mentor',
  'teaching',
  'research',
  'community',
] as const;

export type AcademicRelationshipRole =
  (typeof ACADEMIC_RELATIONSHIP_ROLES)[number];

export type AcademicAffiliationRecord = {
  id: string;
  userId: string;
  institutionId: string;
  campusId?: string;
  academicUnitId?: string;
  programId?: string;
  curriculumId?: string;
  status: AcademicAffiliationStatus;
  roles?: AcademicRelationshipRole[];
  startedOn?: string;
  endedOn?: string;
  createdAt: Date;
  updatedAt: Date;
};

export type SubjectParticipationState =
  'planned' | 'current' | 'completed' | 'dropped';

export type SubjectParticipationRecord = {
  id: string;
  userId: string;
  subjectId: string;
  courseOfferingId?: string;
  state: SubjectParticipationState;
  periodLabel?: string;
  createdAt: Date;
  updatedAt: Date;
};

export type AcademicFollowRecord = {
  id: string;
  userId: string;
  targetNodeId: string;
  targetKind: 'institution' | 'program';
  createdAt: Date;
  updatedAt: Date;
};

export type AcademicCurrentContextRecord = {
  userId: string;
  affiliationId: string;
  subjectParticipationId?: string;
  createdAt: Date;
  updatedAt: Date;
};

export type AcademicProposalStatus =
  'pending' | 'accepted' | 'rejected' | 'duplicate' | 'superseded';

export type AcademicCatalogProposalRecord = {
  id: string;
  userId: string;
  kind: AcademicNodeKind;
  proposedName: string;
  parentIds: string[];
  evidenceUrl?: string;
  notes?: string;
  status: AcademicProposalStatus;
  reviewedByUserId?: string;
  reviewReason?: string;
  canonicalTargetId?: string;
  reviewedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
};

export const ACADEMIC_AUDIT_EVENTS = [
  'academic.catalog.created',
  'academic.catalog.updated',
  'academic.catalog.merged',
  'academic.affiliation.created',
  'academic.affiliation.updated',
  'academic.affiliation.roles_updated',
  'academic.affiliation.graduated',
  'academic.subject_participation.upserted',
  'academic.context.updated',
  'academic.proposal.created',
  'academic.proposal.reviewed',
] as const;

export type AcademicAuditEventName = (typeof ACADEMIC_AUDIT_EVENTS)[number];

export type AcademicAuditEventRecord = {
  id: string;
  event: AcademicAuditEventName;
  actorUserId: string;
  targetId: string;
  metadata?: Record<string, string | number | boolean | null>;
  createdAt: Date;
};
