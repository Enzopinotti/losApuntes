import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayUnique,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Max,
  Min,
} from 'class-validator';

import {
  FEED_FEEDBACK_SIGNALS,
  FEED_MODES,
  FEED_ORDERS,
  type FeedFeedbackSignal,
  type FeedMode,
  type FeedOrder,
} from '../domain/feed.types';

export class FeedPageDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(25)
  limit = 20;

  @IsOptional()
  @IsString()
  @Length(4, 1024)
  cursor?: string;
}

export class ForYouFeedDto extends FeedPageDto {
  @IsOptional()
  @IsIn(FEED_MODES)
  mode: FeedMode = 'balanced';

  @IsOptional()
  @IsIn(FEED_ORDERS)
  order: FeedOrder = 'ranked';
}

export class UpdateFeedPreferencesDto {
  @IsInt()
  @Min(1)
  expectedRevision!: number;

  @IsOptional()
  @IsBoolean()
  useAcademic?: boolean;

  @IsOptional()
  @IsBoolean()
  useSocial?: boolean;

  @IsOptional()
  @IsBoolean()
  useInterests?: boolean;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(100)
  @ArrayUnique()
  @IsUUID('4', { each: true })
  mutedSubjectIds?: string[];

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(100)
  @ArrayUnique()
  @IsUUID('4', { each: true })
  mutedProfileIds?: string[];

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(50)
  @ArrayUnique()
  @IsUUID('4', { each: true })
  prioritizedSubjectIds?: string[];
}

export class SetFeedFeedbackDto {
  @IsIn(FEED_FEEDBACK_SIGNALS)
  signal!: FeedFeedbackSignal;
}
