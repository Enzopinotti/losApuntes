import { Type } from 'class-transformer';
import {
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Length,
  Max,
  Min,
} from 'class-validator';

import {
  CONNECTION_STATUSES,
  type ConnectionStatus,
} from '../domain/social.types';

export class SocialListDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit = 50;

  @IsOptional()
  @IsString()
  @Length(4, 512)
  cursor?: string;
}

export class ConnectionListDto extends SocialListDto {
  @IsOptional()
  @IsIn(CONNECTION_STATUSES)
  status?: ConnectionStatus;
}
