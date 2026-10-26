import {
  Body,
  Controller,
  Delete,
  Get,
  Header,
  Param,
  ParseUUIDPipe,
  Put,
  Req,
  UseGuards,
} from '@nestjs/common';
import { IsInt, IsObject, Max, Min } from 'class-validator';
import type { AuthenticatedRequest } from '../auth/auth.types';
import { AuthSessionGuard } from '../auth/guards/auth-session.guard';
import { StudyProgressService } from './study-progress.service';
import { StudyProgressFeatureGuard } from './study-progress.feature.guard';

class SaveStudyProgressDto {
  @IsInt()
  @Min(0)
  @Max(2_147_483_647)
  expectedRevision!: number;

  @IsObject()
  plan!: Record<string, unknown>;
}
class DeleteStudyProgressDto {
  @IsInt()
  @Min(1)
  @Max(2_147_483_647)
  expectedRevision!: number;
}

@Controller('study-progress')
@UseGuards(AuthSessionGuard, StudyProgressFeatureGuard)
export class StudyProgressController {
  constructor(private readonly service: StudyProgressService) {}

  @Get()
  @Header('Cache-Control', 'private, no-store')
  list(@Req() req: AuthenticatedRequest) {
    return this.service.list(req.user.id);
  }

  @Get(':subjectId')
  @Header('Cache-Control', 'private, no-store')
  get(
    @Req() req: AuthenticatedRequest,
    @Param('subjectId', new ParseUUIDPipe({ version: '4' })) subjectId: string,
  ) {
    return this.service.get(req.user.id, subjectId);
  }

  @Put(':subjectId')
  @Header('Cache-Control', 'private, no-store')
  save(
    @Req() req: AuthenticatedRequest,
    @Param('subjectId', new ParseUUIDPipe({ version: '4' })) subjectId: string,
    @Body() dto: SaveStudyProgressDto,
  ) {
    return this.service.save(
      req.user.id,
      subjectId,
      dto.expectedRevision,
      dto.plan,
    );
  }

  @Delete(':subjectId')
  @Header('Cache-Control', 'private, no-store')
  remove(
    @Req() req: AuthenticatedRequest,
    @Param('subjectId', new ParseUUIDPipe({ version: '4' })) subjectId: string,
    @Body() dto: DeleteStudyProgressDto,
  ) {
    return this.service.remove(req.user.id, subjectId, dto.expectedRevision);
  }
}
