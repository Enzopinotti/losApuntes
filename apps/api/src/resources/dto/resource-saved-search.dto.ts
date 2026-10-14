import { Type } from 'class-transformer';
import {
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Length,
  Matches,
  IsUUID,
  Max,
  Min,
} from 'class-validator';

/** Metadata-only query over the authenticated account's saved resources. */
export class ResourceSavedSearchDto {
  @IsOptional()
  @IsString()
  @Length(2, 120)
  @Matches(/\S[\s\S]*\S/u, {
    message: 'Search requires at least two visible characters',
  })
  q?: string;

  @IsOptional()
  @IsUUID('4')
  subjectId?: string;

  @IsOptional()
  @IsIn(['saved', 'title'])
  order?: 'saved' | 'title';

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  limit = 25;

  @IsOptional()
  @IsString()
  @Length(4, 2048)
  cursor?: string;
}
