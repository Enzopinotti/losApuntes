import { Controller, Get, Header, Query, Req, UseGuards } from '@nestjs/common';

import type { AuthenticatedRequest } from '../auth/auth.types';
import { AuthSessionGuard } from '../auth/guards/auth-session.guard';
import { FollowersService } from './domain/followers.service';
import { FollowersPageDto } from './dto/followers-page.dto';

@Controller('social/me/followers')
@UseGuards(AuthSessionGuard)
export class FollowersController {
  constructor(private readonly followers: FollowersService) {}

  @Get()
  @Header('Cache-Control', 'private, no-store')
  list(@Req() request: AuthenticatedRequest, @Query() query: FollowersPageDto) {
    return this.followers.list(request.user.id, query.limit, query.cursor);
  }

  @Get('count')
  @Header('Cache-Control', 'private, no-store')
  count(@Req() request: AuthenticatedRequest) {
    return this.followers.count(request.user.id);
  }
}
