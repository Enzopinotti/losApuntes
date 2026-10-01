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

export type AcademicAffiliationStatus =
  | 'applicant'
  | 'active'
  | 'paused'
  | 'completed'
  | 'withdrawn'
  | 'alumni';

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

export interface AcademicAffiliation {
  id: string;
  institutionId: string;
  campusId?: string;
  academicUnitId?: string;
  programId?: string;
  curriculumId?: string;
  status: AcademicAffiliationStatus;
  roles: AcademicRelationshipRole[];
  startedOn?: string;
  endedOn?: string;
  createdAt: string;
  updatedAt: string;
}

export type SubjectParticipationState =
  | 'planned'
  | 'current'
  | 'completed'
  | 'dropped';

export interface AcademicSubjectParticipation {
  id: string;
  subjectId: string;
  courseOfferingId?: string;
  state: SubjectParticipationState;
  periodLabel?: string;
  createdAt: string;
  updatedAt: string;
}

export interface AcademicCurrentContext {
  affiliationId: string;
  subjectParticipationId?: string;
  updatedAt: string;
}

export interface AcademicAffiliationListResponse {
  affiliations: AcademicAffiliation[];
  truncated: boolean;
  limit: number;
}

export interface AcademicSubjectParticipationListResponse {
  participations: AcademicSubjectParticipation[];
  truncated: boolean;
  limit: number;
}

export interface AcademicCurrentContextResponse {
  context: AcademicCurrentContext | null;
}

export interface SetAcademicContextInput {
  affiliationId: string;
  subjectParticipationId?: string;
}

export interface AcademicCatalogNode {
  id: string;
  kind: AcademicNodeKind;
  name: string;
  parentIds: string[];
  status: AcademicNodeStatus;
}

export interface AcademicCatalogNodeResponse {
  node: AcademicCatalogNode;
  resolvedFromId: string | null;
}
