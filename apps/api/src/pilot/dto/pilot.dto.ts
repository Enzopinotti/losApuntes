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
  PILOT_MODERATION_ACTIONS,
  PILOT_REPORT_STATUSES,
  type PilotModerationAction,
  type PilotReportStatus,
} from '../domain/pilot.types';

export class PilotModerationListDto {
  @IsOptional()
  @IsIn(PILOT_REPORT_STATUSES)
  status: PilotReportStatus = 'pending';

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit = 50;
}

export class ReviewPilotModerationDto {
  @IsIn(PILOT_MODERATION_ACTIONS)
  action!: PilotModerationAction;

  @IsString()
  @Length(3, 1000)
  reason!: string;
}

export class PilotMetricsDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(90)
  days = 14;
}
