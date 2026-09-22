import { IsString, MaxLength, MinLength } from 'class-validator';

export class GoogleMobileLinkDto {
  @IsString()
  @MinLength(20)
  @MaxLength(8192)
  idToken!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(256)
  currentPassword!: string;
}
