import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsIn,
  IsInt,
  IsISO8601,
  IsOptional,
  IsString,
  IsUrl,
  IsUUID,
  Length,
  Matches,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';

import {
  ACADEMIC_NODE_KINDS,
  type AcademicAffiliationStatus,
  type AcademicAuthorityTier,
  type AcademicNodeKind,
  type AcademicNodeStatus,
  type AcademicProposalStatus,
  type SubjectParticipationState,
} from '../domain/academic.types';

const AFFILIATION_STATUSES: AcademicAffiliationStatus[] = [
  'applicant',
  'active',
  'paused',
  'completed',
  'withdrawn',
  'alumni',
];

const PARTICIPATION_STATES: SubjectParticipationState[] = [
  'planned',
  'current',
  'completed',
  'dropped',
];

const PROPOSAL_STATUSES: AcademicProposalStatus[] = [
  'pending',
  'accepted',
  'rejected',
  'duplicate',
  'superseded',
];

const PROPOSAL_REVIEW_STATUSES: Exclude<AcademicProposalStatus, 'pending'>[] = [
  'accepted',
  'rejected',
  'duplicate',
  'superseded',
];

export class AcademicProvenanceDto {
  @IsIn(['A', 'B', 'C', 'D'])
  authorityTier!: AcademicAuthorityTier;

  @IsString()
  @Length(2, 120)
  sourceKey!: string;

  @IsUrl({ require_protocol: true })
  @Length(8, 2048)
  sourceUrl!: string;

  @IsOptional()
  @IsString()
  @Length(1, 200)
  externalId?: string;

  @IsOptional()
  @IsString()
  @Length(1, 240)
  sourceObservedName?: string;

  @IsOptional()
  @IsString()
  @Length(1, 256)
  sourceFingerprint?: string;

  @IsOptional()
  @IsISO8601({ strict: true, strictSeparator: true })
  verifiedAt?: string;
}

export class CreateAcademicCatalogNodeDto {
  @IsIn(ACADEMIC_NODE_KINDS)
  kind!: AcademicNodeKind;

  @IsString()
  @Length(2, 180)
  name!: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(32)
  @IsString({ each: true })
  @Length(1, 180, { each: true })
  aliases?: string[];

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(16)
  @IsUUID('4', { each: true })
  parentIds?: string[];

  @ValidateNested()
  @Type(() => AcademicProvenanceDto)
  provenance!: AcademicProvenanceDto;
}

export class UpdateAcademicCatalogNodeDto {
  @IsInt()
  @Min(1)
  expectedRevision!: number;

  @IsOptional()
  @IsString()
  @Length(2, 180)
  name?: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(32)
  @IsString({ each: true })
  @Length(1, 180, { each: true })
  aliases?: string[];

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(16)
  @IsUUID('4', { each: true })
  parentIds?: string[];

  @IsOptional()
  @IsIn(['active', 'inactive'])
  status?: Exclude<AcademicNodeStatus, 'merged'>;

  @IsOptional()
  @ValidateNested()
  @Type(() => AcademicProvenanceDto)
  provenance?: AcademicProvenanceDto;
}

export class MergeAcademicCatalogNodeDto {
  @IsUUID('4')
  targetId!: string;

  @IsInt()
  @Min(1)
  expectedRevision!: number;
}

export class AcademicCatalogSearchDto {
  @IsOptional()
  @IsIn(ACADEMIC_NODE_KINDS)
  kind?: AcademicNodeKind;

  @IsOptional()
  @IsString()
  @Length(2, 120)
  q?: string;

  @IsOptional()
  @IsUUID('4')
  parentId?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  limit = 25;

  @IsOptional()
  @IsString()
  @Length(4, 512)
  cursor?: string;
}

export class AcademicCatalogChildrenDto {
  @IsOptional()
  @IsIn(ACADEMIC_NODE_KINDS)
  kind?: AcademicNodeKind;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  limit = 25;
}

export class CreateAcademicAffiliationDto {
  @IsUUID('4')
  institutionId!: string;

  @IsOptional()
  @IsUUID('4')
  campusId?: string;

  @IsOptional()
  @IsUUID('4')
  academicUnitId?: string;

  @IsOptional()
  @IsUUID('4')
  programId?: string;

  @IsOptional()
  @IsUUID('4')
  curriculumId?: string;

  @IsIn(AFFILIATION_STATUSES)
  status!: AcademicAffiliationStatus;

  @IsOptional()
  @Matches(/^\d{4}(?:-(?:0[1-9]|1[0-2]))?$/u)
  startedOn?: string;

  @IsOptional()
  @Matches(/^\d{4}(?:-(?:0[1-9]|1[0-2]))?$/u)
  endedOn?: string;
}

export class UpdateAcademicAffiliationStatusDto {
  @IsIn(AFFILIATION_STATUSES)
  status!: AcademicAffiliationStatus;

  @IsOptional()
  @Matches(/^\d{4}(?:-(?:0[1-9]|1[0-2]))?$/u)
  endedOn?: string;
}

export class UpsertSubjectParticipationDto {
  @IsOptional()
  @IsUUID('4')
  courseOfferingId?: string;

  @IsIn(PARTICIPATION_STATES)
  state!: SubjectParticipationState;

  @IsOptional()
  @IsString()
  @Length(1, 80)
  periodLabel?: string;
}

export class SetAcademicContextDto {
  @IsUUID('4')
  affiliationId!: string;

  @IsOptional()
  @IsUUID('4')
  subjectParticipationId?: string;
}

export class CreateAcademicProposalDto {
  @IsIn(ACADEMIC_NODE_KINDS)
  kind!: AcademicNodeKind;

  @IsString()
  @Length(2, 180)
  proposedName!: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(16)
  @IsUUID('4', { each: true })
  parentIds?: string[];

  @IsOptional()
  @IsUrl({ require_protocol: true })
  @Length(8, 2048)
  evidenceUrl?: string;

  @IsOptional()
  @IsString()
  @Length(1, 2000)
  notes?: string;
}


export class AcademicProposalListDto {
  @IsOptional()
  @IsIn(PROPOSAL_STATUSES)
  status?: AcademicProposalStatus;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit = 50;
}

export class ReviewAcademicProposalDto {
  @IsIn(PROPOSAL_REVIEW_STATUSES)
  status!: Exclude<AcademicProposalStatus, 'pending'>;

  @IsOptional()
  @IsUUID('4')
  canonicalTargetId?: string;

  @IsString()
  @Length(3, 1000)
  reason!: string;
}
