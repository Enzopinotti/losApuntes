import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Query,
  Req,
  UnprocessableEntityException,
  UseGuards,
} from '@nestjs/common';

import type { AuthenticatedRequest } from '../auth/auth.types';
import { AuthSessionGuard } from '../auth/guards/auth-session.guard';
import type { PilotReportKind } from './domain/pilot.types';
import { PilotService } from './domain/pilot.service';
import {
  PilotMetricsDto,
  PilotModerationListDto,
  ReviewPilotModerationDto,
} from './dto/pilot.dto';
import { ModerationWriteGuard } from './guards/moderation-write.guard';
import { PilotOpsReadGuard } from './guards/pilot-ops-read.guard';

@Controller('pilot')
export class PilotController {
  constructor(private readonly pilot: PilotService) {}

  @UseGuards(AuthSessionGuard)
  @Get('home')
  home(@Req() request: AuthenticatedRequest) {
    return this.pilot.home(request.user.id);
  }

  @UseGuards(AuthSessionGuard, PilotOpsReadGuard)
  @Get('admin/moderation')
  moderation(@Query() query: PilotModerationListDto) {
    return this.pilot.listModeration(query.status, query.limit);
  }

  @UseGuards(AuthSessionGuard, PilotOpsReadGuard, ModerationWriteGuard)
  @Patch('admin/moderation/:kind/:reportId')
  review(
    @Req() request: AuthenticatedRequest,
    @Param('kind') kind: string,
    @Param('reportId', new ParseUUIDPipe({ version: '4' })) reportId: string,
    @Body() dto: ReviewPilotModerationDto,
  ) {
    return this.pilot.reviewModeration(
      request.user.id,
      this.reportKind(kind),
      reportId,
      dto,
    );
  }

  @UseGuards(AuthSessionGuard, PilotOpsReadGuard)
  @Get('admin/metrics')
  metrics(@Query() query: PilotMetricsDto) {
    return this.pilot.metrics(query.days);
  }

  private reportKind(value: string): PilotReportKind {
    if (value !== 'resource' && value !== 'qa') {
      throw new UnprocessableEntityException({
        code: 'PILOT_REPORT_KIND_INVALID',
        message: 'Moderation report kind is invalid',
      });
    }
    return value;
  }
}
