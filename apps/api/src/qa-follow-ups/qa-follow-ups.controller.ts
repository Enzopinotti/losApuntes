import { Controller, Get, Header, Req, UseGuards } from '@nestjs/common';

import type { AuthenticatedRequest } from '../auth/auth.types';
import { AuthSessionGuard } from '../auth/guards/auth-session.guard';
import {
  QaFollowUpsService,
  type QaFollowUpInbox,
} from './qa-follow-ups.service';

@Controller('qa/me')
@UseGuards(AuthSessionGuard)
export class QaFollowUpsController {
  constructor(private readonly followUps: QaFollowUpsService) {}

  @Get('follow-ups')
  @Header('Cache-Control', 'private, no-store')
  getFollowUps(@Req() request: AuthenticatedRequest): Promise<QaFollowUpInbox> {
    return this.followUps.forOwner(request.user.id);
  }
}
