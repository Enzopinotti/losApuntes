import { IsString, Matches } from 'class-validator';

import { ACTION_TOKEN_PATTERN } from '../action-token/action-token';
import { IsPasswordPolicy } from './password-policy.validator';

export class PasswordRecoveryCompleteDto {
  @IsString()
  @Matches(ACTION_TOKEN_PATTERN)
  token!: string;

  @IsString()
  @IsPasswordPolicy()
  newPassword!: string;
}
