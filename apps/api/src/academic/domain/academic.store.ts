import type {
  AcademicAffiliationRecord,
  AcademicAuditEventRecord,
  AcademicCatalogNodeRecord,
  AcademicCatalogProposalRecord,
  AcademicCurrentContextRecord,
  AcademicFollowRecord,
  AcademicNodeKind,
  AcademicProposalStatus,
  AcademicRelationshipRole,
  SubjectParticipationRecord,
} from './academic.types';

export const ACADEMIC_STORE = Symbol('ACADEMIC_STORE');

export class AcademicSourceIdentityConflictError extends Error {
  constructor() {
    super('Academic source identity conflict');
    this.name = 'AcademicSourceIdentityConflictError';
  }
}

export type CatalogSearchCursor = {
  normalizedName: string;
  id: string;
};

export type CatalogSearchQuery = {
  kind?: AcademicNodeKind;
  q?: string;
  parentIds?: string[];
  limit: number;
  after?: CatalogSearchCursor;
};

export type CatalogSearchResult = {
  items: AcademicCatalogNodeRecord[];
  hasMore: boolean;
};

export type CreateCatalogNodeRecord = Omit<
  AcademicCatalogNodeRecord,
  'createdAt' | 'updatedAt'
>;

export type UpdateCatalogNodeRecord = Partial<
  Pick<
    AcademicCatalogNodeRecord,
    | 'name'
    | 'normalizedName'
    | 'aliases'
    | 'normalizedAliases'
    | 'parentIds'
    | 'status'
    | 'redirectToId'
    | 'provenance'
  >
>;

export type CreateAffiliationRecord = Omit<
  AcademicAffiliationRecord,
  'createdAt' | 'updatedAt'
>;

export type CreateSubjectParticipationRecord = Omit<
  SubjectParticipationRecord,
  'createdAt' | 'updatedAt'
>;

export type CreateProposalRecord = Omit<
  AcademicCatalogProposalRecord,
  'createdAt' | 'updatedAt'
>;

export interface AcademicStore {
  runAtomically<T>(operation: () => Promise<T>): Promise<T>;

  findCatalogNodeById(id: string): Promise<AcademicCatalogNodeRecord | null>;
  findCatalogNodesByIds(ids: string[]): Promise<AcademicCatalogNodeRecord[]>;
  findDirectRedirectSources(
    targetId: string,
  ): Promise<AcademicCatalogNodeRecord[]>;
  findCatalogNodeBySourceIdentity(
    sourceKey: string,
    externalId: string,
  ): Promise<AcademicCatalogNodeRecord | null>;
  searchCatalog(query: CatalogSearchQuery): Promise<CatalogSearchResult>;
  createCatalogNode(
    input: CreateCatalogNodeRecord,
  ): Promise<AcademicCatalogNodeRecord>;
  updateCatalogNode(
    id: string,
    expectedRevision: number,
    patch: UpdateCatalogNodeRecord,
  ): Promise<AcademicCatalogNodeRecord | null>;

  createAffiliation(
    input: CreateAffiliationRecord,
  ): Promise<AcademicAffiliationRecord>;
  findAffiliationById(id: string): Promise<AcademicAffiliationRecord | null>;
  listAffiliationsForUser(userId: string): Promise<AcademicAffiliationRecord[]>;
  updateAffiliationStatus(
    userId: string,
    id: string,
    expectedStatus: AcademicAffiliationRecord['status'],
    status: AcademicAffiliationRecord['status'],
    endedOn?: string,
  ): Promise<AcademicAffiliationRecord | null>;
  updateAffiliationRoles(
    userId: string,
    id: string,
    expectedStatus: AcademicAffiliationRecord['status'],
    roles: AcademicRelationshipRole[],
  ): Promise<AcademicAffiliationRecord | null>;
  transitionAffiliationToAlumni(
    userId: string,
    id: string,
    graduatedOn: string,
    roles: AcademicRelationshipRole[],
  ): Promise<AcademicAffiliationRecord | null>;

  upsertSubjectParticipation(
    input: CreateSubjectParticipationRecord,
  ): Promise<SubjectParticipationRecord>;
  findSubjectParticipationById(
    id: string,
  ): Promise<SubjectParticipationRecord | null>;
  listSubjectParticipationsForUser(
    userId: string,
  ): Promise<SubjectParticipationRecord[]>;
  transitionSubjectParticipationStates(
    userId: string,
    ids: string[],
    from: SubjectParticipationRecord['state'],
    to: SubjectParticipationRecord['state'],
  ): Promise<number>;

  getCurrentContext(
    userId: string,
  ): Promise<AcademicCurrentContextRecord | null>;
  setCurrentContext(
    input: Omit<AcademicCurrentContextRecord, 'createdAt' | 'updatedAt'>,
  ): Promise<AcademicCurrentContextRecord>;

  upsertAcademicFollow(
    input: Omit<AcademicFollowRecord, 'createdAt' | 'updatedAt'>,
  ): Promise<AcademicFollowRecord>;
  listAcademicFollows(userId: string): Promise<AcademicFollowRecord[]>;
  removeAcademicFollows(
    userId: string,
    targetNodeIds: string[],
  ): Promise<number>;

  createProposal(
    input: CreateProposalRecord,
  ): Promise<AcademicCatalogProposalRecord>;
  findProposalById(id: string): Promise<AcademicCatalogProposalRecord | null>;
  listProposals(
    status: AcademicProposalStatus | undefined,
    limit: number,
  ): Promise<AcademicCatalogProposalRecord[]>;
  reviewProposal(
    id: string,
    reviewerUserId: string,
    status: Exclude<AcademicProposalStatus, 'pending'>,
    reason: string,
    canonicalTargetId?: string,
  ): Promise<AcademicCatalogProposalRecord | null>;

  appendAuditEvent(input: AcademicAuditEventRecord): Promise<void>;
}
