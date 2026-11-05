import { Body, Controller, Header, Post, Req, UseGuards } from '@nestjs/common';

import type { AuthenticatedRequest } from '../auth/auth.types';
import { AuthSessionGuard } from '../auth/guards/auth-session.guard';
import { SavedStatusBatchDto } from './dto/saved-status-batch.dto';
import { ResourceSavedStatusService } from './resource-saved-status.service';

@Controller('resources/saved')
@UseGuards(AuthSessionGuard)
export class ResourceSavedStatusController {
  constructor(private readonly status: ResourceSavedStatusService) {}

  @Post('status')
  @Header('Cache-Control', 'private, no-store')
  check(
    @Req() request: AuthenticatedRequest,
    @Body() body: SavedStatusBatchDto,
  ) {
    return this.status.check(request.user.id, body.resourceIds);
  }
}
