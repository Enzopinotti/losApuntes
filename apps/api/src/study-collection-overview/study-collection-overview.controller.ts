import { Controller, Get, Header, Req, UseGuards } from '@nestjs/common';

import type { AuthenticatedRequest } from '../auth/auth.types';
import { AuthSessionGuard } from '../auth/guards/auth-session.guard';
import { StudyCollectionsFeatureGuard } from '../study-collections/study-collections-feature.guard';
import { StudyCollectionOverviewService } from './study-collection-overview.service';

@Controller('study-collections/overview')
@UseGuards(AuthSessionGuard, StudyCollectionsFeatureGuard)
export class StudyCollectionOverviewController {
  constructor(private readonly overview: StudyCollectionOverviewService) {}

  @Get('me')
  @Header('Cache-Control', 'private, no-store')
  get(@Req() request: AuthenticatedRequest) {
    return this.overview.get(request.user.id);
  }
}
