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
import { StudyProgressFeatureGuard } from '../study-progress/study-progress.feature.guard';
import {
  StudyTaskReferenceCheckService,
  type StudyTaskReferenceCheck,
} from './study-task-reference-check.service';

@Controller('study-progress')
@UseGuards(AuthSessionGuard, StudyProgressFeatureGuard)
export class StudyTaskReferenceCheckController {
  constructor(private readonly checks: StudyTaskReferenceCheckService) {}

  @Get(':subjectId/reference-check')
  @Header('Cache-Control', 'private, no-store')
  getStatus(
    @Req() request: AuthenticatedRequest,
    @Param('subjectId', new ParseUUIDPipe({ version: '4' })) subjectId: string,
  ): Promise<StudyTaskReferenceCheck> {
    return this.checks.forOwner(request.user.id, subjectId);
  }
}
