import { Controller, Get, Header, Query, Req, UseGuards } from '@nestjs/common';

import type { AuthenticatedRequest } from '../auth/auth.types';
import { AuthSessionGuard } from '../auth/guards/auth-session.guard';
import {
  ReceivedRepliesService,
  type ReceivedRepliesPage,
} from './received-replies.service';

@Controller('qa/me')
@UseGuards(AuthSessionGuard)
export class ReceivedRepliesController {
  constructor(private readonly received: ReceivedRepliesService) {}

  @Get('received-replies')
  @Header('Cache-Control', 'private, no-store')
  list(
    @Req() request: AuthenticatedRequest,
    @Query('cursor') cursor?: string,
  ): Promise<ReceivedRepliesPage> {
    return this.received.forOwner(request.user.id, cursor);
  }
}
