import { Controller, Get, Header, Req, UseGuards } from '@nestjs/common';

import type { AuthenticatedRequest } from '../auth/auth.types';
import { AuthSessionGuard } from '../auth/guards/auth-session.guard';
import {
  QaHelpOpportunitiesService,
  type QaHelpOpportunities,
} from './qa-help-opportunities.service';

@Controller('qa/me')
@UseGuards(AuthSessionGuard)
export class QaHelpOpportunitiesController {
  constructor(private readonly opportunities: QaHelpOpportunitiesService) {}

  @Get('help-opportunities')
  @Header('Cache-Control', 'private, no-store')
  list(
    @Req() request: AuthenticatedRequest,
  ): Promise<QaHelpOpportunities> {
    return this.opportunities.forOwner(request.user.id);
  }
}
