import { Controller, Get, Header, Req, UseGuards } from '@nestjs/common';

import type { AuthenticatedRequest } from '../auth/auth.types';
import { AuthSessionGuard } from '../auth/guards/auth-session.guard';
import { StudyProgressFeatureGuard } from '../study-progress/study-progress.feature.guard';
import { StudyCalendarService } from './study-calendar.service';

@Controller('study-progress/me')
@UseGuards(AuthSessionGuard, StudyProgressFeatureGuard)
export class StudyCalendarController {
  constructor(private readonly calendar: StudyCalendarService) {}

  @Get('calendar.ics')
  @Header('Cache-Control', 'private, no-store')
  @Header('Content-Type', 'text/calendar; charset=utf-8')
  @Header(
    'Content-Disposition',
    'attachment; filename="los-apuntes-sesiones.ics"',
  )
  @Header('X-Content-Type-Options', 'nosniff')
  exportCalendar(@Req() request: AuthenticatedRequest): Promise<string> {
    return this.calendar.forOwner(request.user.id);
  }
}
