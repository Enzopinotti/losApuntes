import { Type } from 'class-transformer';
import {
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Max,
  Min,
} from 'class-validator';

export const SEARCH_SCOPES = [
  'all',
  'resources',
  'subjects',
  'people',
] as const;

export type SearchScope = (typeof SEARCH_SCOPES)[number];

export class SearchQueryDto {
  @IsString()
  @Length(2, 120)
  q!: string;

  @IsOptional()
  @IsIn(SEARCH_SCOPES)
  scope: SearchScope = 'all';

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(20)
  limit = 8;

  @IsOptional()
  @IsUUID('4')
  subjectId?: string;
}

export class ContextualDiscoveryQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(8)
  subjectLimit = 6;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(8)
  resourcesPerSubject = 4;
}
