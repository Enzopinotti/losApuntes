import { IsOptional, IsString, MaxLength } from 'class-validator';

export class GoogleWebStartQueryDto {
  @IsOptional()
  @IsString()
  @MaxLength(256)
  returnTo?: string;
}
