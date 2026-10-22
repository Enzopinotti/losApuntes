import { Controller, Get, Header, Req, UseGuards } from '@nestjs/common';

import type { AuthenticatedRequest } from '../auth/auth.types';
import { AuthSessionGuard } from '../auth/guards/auth-session.guard';
import {
  QaSubjectActivityService,
  type QaSubjectActivityPage,
} from './qa-subject-activity.service';

@Controller('qa/me')
@UseGuards(AuthSessionGuard)
export class QaSubjectActivityController {
  constructor(private readonly activity: QaSubjectActivityService) {}

  @Get('subject-activity')
  @Header('Cache-Control', 'private, no-store')
  getSubjectActivity(
    @Req() request: AuthenticatedRequest,
  ): Promise<QaSubjectActivityPage> {
    return this.activity.forOwner(request.user.id);
  }
}
