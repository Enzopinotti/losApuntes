import {
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';

import { ACTION_TOKEN_PATTERN } from '../action-token/action-token';
import {
  PASSWORD_MAX_LENGTH,
  PASSWORD_MIN_LENGTH,
} from '../password-policy';

export class PasswordRecoveryCompleteDto {
  @IsString()
  @Matches(ACTION_TOKEN_PATTERN)
  token!: string;

  @IsString()
  @MinLength(PASSWORD_MIN_LENGTH)
  @MaxLength(PASSWORD_MAX_LENGTH)
  newPassword!: string;
}
