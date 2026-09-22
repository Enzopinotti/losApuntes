import { IsString, MaxLength, MinLength } from 'class-validator';

import { PASSWORD_MAX_LENGTH, PASSWORD_MIN_LENGTH } from '../password-policy';

export class PasswordChangeDto {
  @IsString()
  @MinLength(1)
  @MaxLength(PASSWORD_MAX_LENGTH)
  currentPassword!: string;

  @IsString()
  @MinLength(PASSWORD_MIN_LENGTH)
  @MaxLength(PASSWORD_MAX_LENGTH)
  newPassword!: string;
}
