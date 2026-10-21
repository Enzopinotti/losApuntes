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
  QaSolvedLibraryService,
  type SolvedQaPage,
} from './qa-solved-library.service';

@Controller('qa/discovery')
@UseGuards(AuthSessionGuard)
export class QaSolvedLibraryController {
  constructor(private readonly solved: QaSolvedLibraryService) {}

  @Get('solved-questions')
  @Header('Cache-Control', 'private, no-store')
  list(
    @Req() request: AuthenticatedRequest,
    @Query('subjectId', new ParseUUIDPipe({ version: '4' })) subjectId: string,
    @Query('cursor') cursor?: string,
  ): Promise<SolvedQaPage> {
    return this.solved.forSubject(request.user.id, subjectId, cursor);
  }
}
