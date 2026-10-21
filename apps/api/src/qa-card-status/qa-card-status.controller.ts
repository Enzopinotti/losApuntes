import {
  Body,
  Controller,
  Header,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';

import type { AuthenticatedRequest } from '../auth/auth.types';
import { AuthSessionGuard } from '../auth/guards/auth-session.guard';
import { BatchQaCardStatusDto } from './qa-card-status.dto';
import {
  QaCardStatusService,
  type QaCardStatusBatch,
} from './qa-card-status.service';

@Controller('qa/discovery')
@UseGuards(AuthSessionGuard)
export class QaCardStatusController {
  constructor(private readonly statuses: QaCardStatusService) {}

  @Post('batch-question-status')
  @Header('Cache-Control', 'private, no-store')
  refresh(
    @Req() request: AuthenticatedRequest,
    @Body() dto: BatchQaCardStatusDto,
  ): Promise<QaCardStatusBatch> {
    return this.statuses.forViewer(request.user.id, dto);
  }
}
