import { Controller, Get, Header, Req, UseGuards } from '@nestjs/common';

import type { AuthenticatedRequest } from '../auth/auth.types';
import { AuthSessionGuard } from '../auth/guards/auth-session.guard';
import { StudyProgressFeatureGuard } from '../study-progress/study-progress.feature.guard';
import {
  StudyNextActionsService,
  type StudyNextActions,
} from './study-next-actions.service';

@Controller('study-progress/me')
@UseGuards(AuthSessionGuard, StudyProgressFeatureGuard)
export class StudyNextActionsController {
  constructor(private readonly actions: StudyNextActionsService) {}

  @Get('next-actions')
  @Header('Cache-Control', 'private, no-store')
  getNextActions(
    @Req() request: AuthenticatedRequest,
  ): Promise<StudyNextActions> {
    return this.actions.forOwner(request.user.id);
  }
}
