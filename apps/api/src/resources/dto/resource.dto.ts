import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayUnique,
  IsArray,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Max,
  Min,
} from 'class-validator';

import {
  RESOURCE_REPORT_REASONS,
  RESOURCE_VISIBILITIES,
  type ResourceReportReason,
  type ResourceVisibility,
} from '../domain/resource.types';

export class CreateResourceDto {
  @IsUUID('4')
  assetId!: string;

  @IsString()
  @Length(2, 160)
  title!: string;

  @IsOptional()
  @IsString()
  @Length(1, 3000)
  description?: string | null;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(12)
  @ArrayUnique()
  @IsString({ each: true })
  @Length(1, 40, { each: true })
  tags?: string[];

  @IsUUID('4')
  subjectId!: string;

  @IsOptional()
  @IsUUID('4')
  courseOfferingId?: string;

  @IsIn(RESOURCE_VISIBILITIES)
  visibility!: ResourceVisibility;
}

export class UpdateResourceDto {
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
  @IsArray()
  @ArrayMaxSize(12)
  @ArrayUnique()
  @IsString({ each: true })
  @Length(1, 40, { each: true })
  tags?: string[];

  @IsOptional()
  @IsIn(RESOURCE_VISIBILITIES)
  visibility?: ResourceVisibility;
}

export class ResourceSearchDto {
  @IsOptional()
  @IsString()
  @Length(2, 120)
  q?: string;

  @IsOptional()
  @IsUUID('4')
  subjectId?: string;

  @IsOptional()
  @IsIn(RESOURCE_VISIBILITIES)
  visibility?: ResourceVisibility;

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

export class ResourceAccessDto {
  @IsOptional()
  @IsIn(['inline', 'attachment'])
  disposition: 'inline' | 'attachment' = 'inline';
}

export class ResourceSavedListDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  limit = 25;
}

export class CreateResourceReportDto {
  @IsIn(RESOURCE_REPORT_REASONS)
  reason!: ResourceReportReason;

  @IsOptional()
  @IsString()
  @Length(3, 1500)
  details?: string | null;
}
