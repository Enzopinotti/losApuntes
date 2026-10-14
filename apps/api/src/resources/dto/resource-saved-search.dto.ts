import { Type } from 'class-transformer';
import {
  IsInt,
  IsOptional,
  IsString,
  Length,
  Max,
  Min,
} from 'class-validator';

/** Metadata-only query over the authenticated account's saved resources. */
export class ResourceSavedSearchDto {
  @IsString()
  @Length(2, 120)
  q!: string;

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
