import { Type } from 'class-transformer';
import {
  IsIn,
  IsInt,
  IsISO8601,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Max,
  Min,
} from 'class-validator';

import {
  ORGANIZATION_EVENT_STATES,
  ORGANIZATION_MANAGER_ROLES,
  ORGANIZATION_TYPES,
  ORGANIZATION_VERIFICATION_STATES,
  type OrganizationEventState,
  type OrganizationManagerRole,
  type OrganizationType,
  type OrganizationVerificationState,
} from '../domain/organization.types';

export class CreateOrganizationDto {
  @IsString()
  @Length(2, 120)
  name!: string;

  @IsIn(ORGANIZATION_TYPES)
  type!: OrganizationType;

  @IsOptional()
  @IsString()
  @Length(1, 2000)
  about?: string | null;

  @IsOptional()
  @IsString()
  @Length(1, 2048)
  avatarUrl?: string | null;

  @IsOptional()
  @IsString()
  @Length(1, 2048)
  coverUrl?: string | null;

  @IsOptional()
  @IsString()
  @Length(1, 2048)
  websiteUrl?: string | null;

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
}

export class UpdateOrganizationDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  expectedRevision!: number;

  @IsOptional()
  @IsString()
  @Length(2, 120)
  name?: string;

  @IsOptional()
  @IsString()
  @Length(1, 2000)
  about?: string | null;

  @IsOptional()
  @IsString()
  @Length(1, 2048)
  avatarUrl?: string | null;

  @IsOptional()
  @IsString()
  @Length(1, 2048)
  coverUrl?: string | null;

  @IsOptional()
  @IsString()
  @Length(1, 2048)
  websiteUrl?: string | null;
}

export class OrganizationSearchDto {
  @IsOptional()
  @IsString()
  @Length(2, 120)
  q?: string;

  @IsOptional()
  @IsIn(ORGANIZATION_TYPES)
  type?: OrganizationType;

  @IsOptional()
  @IsUUID('4')
  institutionId?: string;

  @IsOptional()
  @IsUUID('4')
  programId?: string;

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

export class ChangeOrganizationManagerDto {
  @IsIn(ORGANIZATION_MANAGER_ROLES)
  role!: OrganizationManagerRole;

  @IsString()
  @Length(3, 500)
  reason!: string;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  expectedManagementRevision!: number;
}

export class RemoveOrganizationManagerDto {
  @IsString()
  @Length(3, 500)
  reason!: string;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  expectedManagementRevision!: number;
}

export class UpdateOrganizationVerificationDto {
  @IsIn(ORGANIZATION_VERIFICATION_STATES)
  verificationState!: OrganizationVerificationState;

  @IsString()
  @Length(3, 500)
  reason!: string;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  expectedRevision!: number;
}

export class CreateOrganizationPostDto {
  @IsOptional()
  @IsString()
  @Length(2, 160)
  title?: string | null;

  @IsString()
  @Length(2, 5000)
  body!: string;

  @IsOptional()
  @IsUUID('4')
  subjectId?: string | null;
}

export class UpdateOrganizationPostDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  expectedRevision!: number;

  @IsOptional()
  @IsString()
  @Length(2, 160)
  title?: string | null;

  @IsOptional()
  @IsString()
  @Length(2, 5000)
  body?: string;

  @IsOptional()
  @IsUUID('4')
  subjectId?: string | null;
}

export class OrganizationPostListDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  limit = 20;

  @IsOptional()
  @IsISO8601()
  before?: string;
}

export class CreateOrganizationEventDto {
  @IsString()
  @Length(2, 160)
  title!: string;

  @IsOptional()
  @IsString()
  @Length(1, 3000)
  description?: string | null;

  @IsISO8601()
  startsAt!: string;

  @IsOptional()
  @IsISO8601()
  endsAt?: string | null;

  @IsOptional()
  @IsString()
  @Length(1, 240)
  locationLabel?: string | null;

  @IsOptional()
  @IsString()
  @Length(1, 2048)
  externalUrl?: string | null;
}

export class UpdateOrganizationEventDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  expectedRevision!: number;

  @IsOptional()
  @IsString()
  @Length(2, 160)
  title?: string;

  @IsOptional()
  @IsString()
  @Length(1, 3000)
  description?: string | null;

  @IsOptional()
  @IsISO8601()
  startsAt?: string;

  @IsOptional()
  @IsISO8601()
  endsAt?: string | null;

  @IsOptional()
  @IsString()
  @Length(1, 240)
  locationLabel?: string | null;

  @IsOptional()
  @IsString()
  @Length(1, 2048)
  externalUrl?: string | null;

  @IsOptional()
  @IsIn(ORGANIZATION_EVENT_STATES)
  state?: OrganizationEventState;
}

export class OrganizationEventListDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  limit = 20;

  @IsOptional()
  @IsISO8601()
  from?: string;
}

export class CreateOrganizationLinkDto {
  @IsString()
  @Length(2, 80)
  label!: string;

  @IsString()
  @Length(8, 2048)
  url!: string;
}
