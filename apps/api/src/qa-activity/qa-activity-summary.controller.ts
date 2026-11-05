import { Controller, Get, Header, Req, UseGuards } from '@nestjs/common';

import type { AuthenticatedRequest } from '../auth/auth.types';
import { AuthSessionGuard } from '../auth/guards/auth-session.guard';
import {
  QaActivitySummaryService,
  type QaActivitySummary,
} from './qa-activity-summary.service';

@Controller('qa/me')
@UseGuards(AuthSessionGuard)
export class QaActivitySummaryController {
  constructor(private readonly summary: QaActivitySummaryService) {}

  @Get('activity-summary')
  @Header('Cache-Control', 'private, no-store')
  getSummary(@Req() request: AuthenticatedRequest): Promise<QaActivitySummary> {
    return this.summary.forOwner(request.user.id);
  }
}
