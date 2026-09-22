import { IsString, MaxLength, MinLength } from 'class-validator';

export class GoogleUnlinkDto {
  @IsString()
  @MinLength(1)
  @MaxLength(256)
  currentPassword!: string;
}
