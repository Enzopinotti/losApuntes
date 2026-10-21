import {
  Controller,
  Get,
  Header,
  ParseUUIDPipe,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';

import type { AuthenticatedRequest } from '../auth/auth.types';
import { AuthSessionGuard } from '../auth/guards/auth-session.guard';
import {
  QaNeedsHelpService,
  type QaNeedsHelpPage,
} from './qa-needs-help.service';

@Controller('qa/discovery')
@UseGuards(AuthSessionGuard)
export class QaNeedsHelpController {
  constructor(private readonly needsHelp: QaNeedsHelpService) {}

  @Get('needs-help')
  @Header('Cache-Control', 'private, no-store')
  list(
    @Req() request: AuthenticatedRequest,
    @Query('subjectId', new ParseUUIDPipe({ version: '4' })) subjectId: string,
    @Query('cursor') cursor?: string,
  ): Promise<QaNeedsHelpPage> {
    return this.needsHelp.forSubject(request.user.id, subjectId, cursor);
  }
}
