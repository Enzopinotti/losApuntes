import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayUnique,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUrl,
  Length,
  Matches,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';

import {
  PROFILE_ACCENT_PRESETS,
  PROFILE_ACTIVITY_TYPES,
  PROFILE_COVER_PRESETS,
  PROFILE_SECTIONS,
  PROFILE_VISIBILITIES,
  type ProfileAccentPreset,
  type ProfileActivityType,
  type ProfileCoverPreset,
  type ProfileSection,
  type ProfileVisibility,
} from '../domain/profile.types';

export class ProfileProfessionalDto {
  @IsOptional()
  @IsString()
  @Length(2, 140)
  headline?: string;

  @IsOptional()
  @IsBoolean()
  careerDiscoveryOptIn?: boolean;
}

export class ProfilePresentationDto {
  @IsOptional()
  @IsIn(PROFILE_ACCENT_PRESETS)
  accentPreset?: ProfileAccentPreset;

  @IsOptional()
  @IsIn(PROFILE_COVER_PRESETS)
  coverPreset?: ProfileCoverPreset;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(PROFILE_SECTIONS.length)
  @ArrayUnique()
  @IsIn(PROFILE_SECTIONS, { each: true })
  sectionOrder?: ProfileSection[];
}

export class ProfileVisibilityDto {
  @IsOptional()
  @IsIn(PROFILE_VISIBILITIES)
  about?: ProfileVisibility;

  @IsOptional()
  @IsIn(PROFILE_VISIBILITIES)
  academic?: ProfileVisibility;

  @IsOptional()
  @IsIn(PROFILE_VISIBILITIES)
  learning?: ProfileVisibility;

  @IsOptional()
  @IsIn(PROFILE_VISIBILITIES)
  activities?: ProfileVisibility;

  @IsOptional()
  @IsIn(PROFILE_VISIBILITIES)
  skills?: ProfileVisibility;

  @IsOptional()
  @IsIn(PROFILE_VISIBILITIES)
  professional?: ProfileVisibility;

  @IsOptional()
  @IsIn(PROFILE_VISIBILITIES)
  contributions?: ProfileVisibility;
}

export class ProfileRecommendationSignalsDto {
  @IsOptional()
  @IsBoolean()
  academicContext?: boolean;

  @IsOptional()
  @IsBoolean()
  learning?: boolean;

  @IsOptional()
  @IsBoolean()
  skillsInterests?: boolean;
}

class ProfileEditableFieldsDto {
  @IsOptional()
  @IsString()
  @Length(2, 80)
  displayName?: string;

  @IsOptional()
  @IsString()
  @Length(1, 500)
  bio?: string;

  @IsOptional()
  @IsUrl({
    protocols: ['https'],
    require_protocol: true,
    require_valid_protocol: true,
  })
  @Length(8, 2048)
  avatarUrl?: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(10)
  @ArrayUnique()
  @IsString({ each: true })
  @Length(2, 35, { each: true })
  languages?: string[];

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(30)
  @ArrayUnique()
  @IsString({ each: true })
  @Length(1, 60, { each: true })
  skills?: string[];

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(30)
  @ArrayUnique()
  @IsString({ each: true })
  @Length(1, 60, { each: true })
  interests?: string[];

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @ArrayUnique()
  @IsString({ each: true })
  @Length(1, 100, { each: true })
  helpTopics?: string[];

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @ArrayUnique()
  @IsString({ each: true })
  @Length(1, 100, { each: true })
  learningTopics?: string[];

  @IsOptional()
  @ValidateNested()
  @Type(() => ProfileProfessionalDto)
  professional?: ProfileProfessionalDto;

  @IsOptional()
  @ValidateNested()
  @Type(() => ProfilePresentationDto)
  presentation?: ProfilePresentationDto;

  @IsOptional()
  @ValidateNested()
  @Type(() => ProfileVisibilityDto)
  visibility?: ProfileVisibilityDto;

  @IsOptional()
  @ValidateNested()
  @Type(() => ProfileRecommendationSignalsDto)
  recommendationSignals?: ProfileRecommendationSignalsDto;
}

export class CreateProfileDto extends ProfileEditableFieldsDto {
  @IsString()
  @Length(2, 80)
  declare displayName: string;
}

export class UpdateProfileDto extends ProfileEditableFieldsDto {
  @IsInt()
  @Min(1)
  expectedRevision!: number;
}

export class CreateProfileActivityDto {
  @IsIn(PROFILE_ACTIVITY_TYPES)
  type!: ProfileActivityType;

  @IsString()
  @Length(2, 120)
  title!: string;

  @IsOptional()
  @IsString()
  @Length(1, 1000)
  description?: string;

  @IsOptional()
  @IsUrl({
    protocols: ['https'],
    require_protocol: true,
    require_valid_protocol: true,
  })
  @Length(8, 2048)
  url?: string;

  @IsOptional()
  @Matches(/^\d{4}(?:-(?:0[1-9]|1[0-2]))?$/u)
  startedOn?: string;

  @IsOptional()
  @Matches(/^\d{4}(?:-(?:0[1-9]|1[0-2]))?$/u)
  endedOn?: string;
}

export class UpdateProfileActivityDto {
  @IsInt()
  @Min(1)
  expectedRevision!: number;

  @IsOptional()
  @IsIn(PROFILE_ACTIVITY_TYPES)
  type?: ProfileActivityType;

  @IsOptional()
  @IsString()
  @Length(2, 120)
  title?: string;

  @IsOptional()
  @IsString()
  @Length(1, 1000)
  description?: string;

  @IsOptional()
  @IsUrl({
    protocols: ['https'],
    require_protocol: true,
    require_valid_protocol: true,
  })
  @Length(8, 2048)
  url?: string;

  @IsOptional()
  @Matches(/^\d{4}(?:-(?:0[1-9]|1[0-2]))?$/u)
  startedOn?: string;

  @IsOptional()
  @Matches(/^\d{4}(?:-(?:0[1-9]|1[0-2]))?$/u)
  endedOn?: string;
}

export class DeleteProfileActivityQueryDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(Number.MAX_SAFE_INTEGER)
  expectedRevision!: number;
}
