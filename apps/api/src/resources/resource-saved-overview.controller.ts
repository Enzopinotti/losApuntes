import { Controller, Get, Header, Req, UseGuards } from '@nestjs/common';

import type { AuthenticatedRequest } from '../auth/auth.types';
import { AuthSessionGuard } from '../auth/guards/auth-session.guard';
import { ResourceSavedOverviewService } from './resource-saved-overview.service';

@Controller('resources/saved/overview')
@UseGuards(AuthSessionGuard)
export class ResourceSavedOverviewController {
  constructor(private readonly overview: ResourceSavedOverviewService) {}

  @Get()
  @Header('Cache-Control', 'private, no-store')
  get(@Req() request: AuthenticatedRequest) {
    return this.overview.get(request.user.id);
  }
}
