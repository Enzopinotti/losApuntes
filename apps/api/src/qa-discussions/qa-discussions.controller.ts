import { Controller, Get, Header, Req, UseGuards } from '@nestjs/common';

import type { AuthenticatedRequest } from '../auth/auth.types';
import { AuthSessionGuard } from '../auth/guards/auth-session.guard';
import {
  QaDiscussionsService,
  type QaDiscussionsPreview,
} from './qa-discussions.service';

@Controller('qa/me')
@UseGuards(AuthSessionGuard)
export class QaDiscussionsController {
  constructor(private readonly discussions: QaDiscussionsService) {}

  @Get('discussions')
  @Header('Cache-Control', 'private, no-store')
  preview(@Req() request: AuthenticatedRequest): Promise<QaDiscussionsPreview> {
    return this.discussions.previewForOwner(request.user.id);
  }
}
