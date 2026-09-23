import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Put,
  Query,
  Req,
  UnprocessableEntityException,
  UseGuards,
} from '@nestjs/common';

import type { AuthenticatedRequest } from '../auth/auth.types';
import { AuthSessionGuard } from '../auth/guards/auth-session.guard';
import {
  FeedPageDto,
  ForYouFeedDto,
  SetFeedFeedbackDto,
  UpdateFeedPreferencesDto,
} from './dto/feed.dto';
import { FeedService } from './domain/feed.service';
import {
  FEED_TARGET_TYPES,
  type FeedTargetType,
} from './domain/feed.types';

@Controller('feeds')
@UseGuards(AuthSessionGuard)
export class FeedsController {
  constructor(private readonly feeds: FeedService) {}

  @Get('academic')
  academic(
    @Req() request: AuthenticatedRequest,
    @Query() query: FeedPageDto,
  ) {
    return this.feeds.academicFeed(request.user.id, query);
  }

  @Get('for-you')
  forYou(
    @Req() request: AuthenticatedRequest,
    @Query() query: ForYouFeedDto,
  ) {
    return this.feeds.forYou(request.user.id, query);
  }

  @Get('preferences')
  preferences(@Req() request: AuthenticatedRequest) {
    return this.feeds.getPreferences(request.user.id);
  }

  @Patch('preferences')
  updatePreferences(
    @Req() request: AuthenticatedRequest,
    @Body() dto: UpdateFeedPreferencesDto,
  ) {
    return this.feeds.updatePreferences(request.user.id, dto);
  }

  @Put('feedback/:type/:id')
  feedback(
    @Req() request: AuthenticatedRequest,
    @Param('type') type: string,
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Body() dto: SetFeedFeedbackDto,
  ) {
    return this.feeds.setFeedback(
      request.user.id,
      this.targetType(type),
      id,
      dto.signal,
    );
  }

  @Delete('feedback/:type/:id')
  clearFeedback(
    @Req() request: AuthenticatedRequest,
    @Param('type') type: string,
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
  ) {
    return this.feeds.clearFeedback(
      request.user.id,
      this.targetType(type),
      id,
    );
  }

  private targetType(value: string): FeedTargetType {
    if (!FEED_TARGET_TYPES.includes(value as FeedTargetType)) {
      throw new UnprocessableEntityException({
        code: 'FEED_TARGET_TYPE_INVALID',
        message: 'Feed target type is invalid',
      });
    }

    return value as FeedTargetType;
  }
}
