import { Controller, Get, Header, Req, UseGuards } from '@nestjs/common';

import type { AuthenticatedRequest } from '../auth/auth.types';
import { AuthSessionGuard } from '../auth/guards/auth-session.guard';
import { StudyProgressFeatureGuard } from '../study-progress/study-progress.feature.guard';
import { StudyAgendaService, type StudyAgenda } from './study-agenda.service';

@Controller('study-progress/me')
@UseGuards(AuthSessionGuard, StudyProgressFeatureGuard)
export class StudyAgendaController {
  constructor(private readonly agenda: StudyAgendaService) {}

  @Get('agenda')
  @Header('Cache-Control', 'private, no-store')
  getAgenda(@Req() request: AuthenticatedRequest): Promise<StudyAgenda> {
    return this.agenda.forOwner(request.user.id);
  }
}
