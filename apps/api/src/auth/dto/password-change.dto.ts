import { IsString, MaxLength, MinLength } from 'class-validator';

import { PASSWORD_MAX_LENGTH } from '../password-policy';
import { IsPasswordPolicy } from './password-policy.validator';

export class PasswordChangeDto {
  @IsString()
  @MinLength(1)
  @MaxLength(PASSWORD_MAX_LENGTH)
  currentPassword!: string;

  @IsString()
  @IsPasswordPolicy()
  newPassword!: string;
}
