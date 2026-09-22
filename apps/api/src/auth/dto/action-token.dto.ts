import { IsString, Matches } from 'class-validator';

import { ACTION_TOKEN_PATTERN } from '../action-token/action-token';

export class ActionTokenDto {
  @IsString()
  @Matches(ACTION_TOKEN_PATTERN)
  token!: string;
}
