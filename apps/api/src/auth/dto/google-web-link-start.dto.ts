import { IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class GoogleWebLinkStartDto {
  @IsString()
  @MinLength(1)
  @MaxLength(256)
  currentPassword!: string;

  @IsOptional()
  @IsString()
  @MaxLength(256)
  returnTo?: string;
}
