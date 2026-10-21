import { Controller, Get, Header, Req, UseGuards } from '@nestjs/common';

import type { AuthenticatedRequest } from '../auth/auth.types';
import { AuthSessionGuard } from '../auth/guards/auth-session.guard';
import {
  QaActivityCalendarService,
  type QaActivityCalendar,
} from './qa-activity-calendar.service';

@Controller('qa/me')
@UseGuards(AuthSessionGuard)
export class QaActivityCalendarController {
  constructor(private readonly calendar: QaActivityCalendarService) {}

  @Get('activity-calendar')
  @Header('Cache-Control', 'private, no-store')
  getCalendar(
    @Req() request: AuthenticatedRequest,
  ): Promise<QaActivityCalendar> {
    return this.calendar.forOwner(request.user.id);
  }
}
