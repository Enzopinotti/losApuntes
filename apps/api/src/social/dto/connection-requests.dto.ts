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
  CONNECTION_REQUEST_DIRECTIONS,
  type ConnectionRequestDirection,
} from '../domain/connection-request.cursor';

export class ConnectionRequestsDto {
  @IsOptional()
  @IsIn(CONNECTION_REQUEST_DIRECTIONS)
  direction: ConnectionRequestDirection = 'incoming';

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(25)
  limit = 25;

  @IsOptional()
  @IsString()
  @Length(4, 512)
  cursor?: string;
}
