import { IsOptional, IsString, MaxLength } from 'class-validator';

export class GoogleWebCallbackQueryDto {
  @IsString()
  @MaxLength(256)
  state!: string;

  @IsOptional()
  @IsString()
  @MaxLength(4096)
  code?: string;

  @IsOptional()
  @IsString()
  @MaxLength(128)
  error?: string;
}
