import { Controller, Get, Header, Query, Req, UseGuards } from '@nestjs/common';

import type { AuthenticatedRequest } from '../auth/auth.types';
import { AuthSessionGuard } from '../auth/guards/auth-session.guard';
import { QaMyAnswersService } from './domain/qa-my-answers.service';
import { MyAnswersQueryDto } from './dto/qa-my-answers.dto';

@Controller('answers')
@UseGuards(AuthSessionGuard)
export class QaMyAnswersController {
  constructor(private readonly myAnswers: QaMyAnswersService) {}

  @Get('mine')
  @Header('Cache-Control', 'private, no-store')
  list(
    @Req() request: AuthenticatedRequest,
    @Query() query: MyAnswersQueryDto,
  ) {
    return this.myAnswers.list(request.user.id, query);
  }
}
