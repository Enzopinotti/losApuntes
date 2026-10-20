import { Controller, Get, Header, Req, UseGuards } from '@nestjs/common';

import type { AuthenticatedRequest } from '../auth/auth.types';
import { AuthSessionGuard } from '../auth/guards/auth-session.guard';
import {
  NetworkOverviewService,
  type NetworkOverview,
} from './network-overview.service';

@Controller('social/me')
@UseGuards(AuthSessionGuard)
export class NetworkOverviewController {
  constructor(private readonly overview: NetworkOverviewService) {}

  @Get('network-overview')
  @Header('Cache-Control', 'private, no-store')
  getOverview(@Req() request: AuthenticatedRequest): Promise<NetworkOverview> {
    return this.overview.forOwner(request.user.id);
  }
}
