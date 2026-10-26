import {
  Controller,
  Get,
  Header,
  Param,
  ParseUUIDPipe,
  Req,
  UseGuards,
} from '@nestjs/common';

import type { AuthenticatedRequest } from '../auth/auth.types';
import { AuthSessionGuard } from '../auth/guards/auth-session.guard';
import { StudyProgressFeatureGuard } from './study-progress.feature.guard';
import { StudySessionSummaryService } from './study-session-summary.service';

@Controller('study-progress')
@UseGuards(AuthSessionGuard, StudyProgressFeatureGuard)
export class StudySessionSummaryController {
  constructor(private readonly summaries: StudySessionSummaryService) {}

  @Get(':subjectId/summary')
  @Header('Cache-Control', 'private, no-store')
  get(
    @Req() request: AuthenticatedRequest,
    @Param('subjectId', new ParseUUIDPipe({ version: '4' }))
    subjectId: string,
  ) {
    return this.summaries.get(request.user.id, subjectId);
  }
}
