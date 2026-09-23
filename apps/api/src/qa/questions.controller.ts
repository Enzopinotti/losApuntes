import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';

import type {
  AuthenticatedRequest,
  OptionallyAuthenticatedRequest,
} from '../auth/auth.types';
import { AuthSessionGuard } from '../auth/guards/auth-session.guard';
import { OptionalAuthSessionGuard } from '../auth/guards/optional-auth-session.guard';
import { VerifiedEmailGuard } from '../auth/guards/verified-email.guard';
import { QaService } from './domain/qa.service';
import {
  AcceptAnswerDto,
  CreateAnswerDto,
  CreateQaReportDto,
  CreateQuestionDto,
  QuestionSearchDto,
  UpdateAnswerDto,
  UpdateQuestionDto,
} from './dto/qa.dto';

@Controller()
export class QuestionsController {
  constructor(private readonly qa: QaService) {}

  @UseGuards(OptionalAuthSessionGuard)
  @Get('questions')
  search(@Query() query: QuestionSearchDto) {
    return this.qa.search(query);
  }

  @UseGuards(OptionalAuthSessionGuard)
  @Get('questions/:id')
  get(
    @Req() request: OptionallyAuthenticatedRequest,
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
  ) {
    return this.qa.get(id, request.user?.id);
  }

  @UseGuards(AuthSessionGuard, VerifiedEmailGuard)
  @Post('questions')
  create(@Req() request: AuthenticatedRequest, @Body() dto: CreateQuestionDto) {
    return this.qa.create(request.user.id, dto);
  }

  @UseGuards(AuthSessionGuard, VerifiedEmailGuard)
  @Patch('questions/:id')
  update(
    @Req() request: AuthenticatedRequest,
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Body() dto: UpdateQuestionDto,
  ) {
    return this.qa.update(request.user.id, id, dto);
  }

  @UseGuards(AuthSessionGuard, VerifiedEmailGuard)
  @Post('questions/:id/answers')
  createAnswer(
    @Req() request: AuthenticatedRequest,
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Body() dto: CreateAnswerDto,
  ) {
    return this.qa.createAnswer(request.user.id, id, dto);
  }

  @UseGuards(AuthSessionGuard, VerifiedEmailGuard)
  @Patch('answers/:id')
  updateAnswer(
    @Req() request: AuthenticatedRequest,
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Body() dto: UpdateAnswerDto,
  ) {
    return this.qa.updateAnswer(request.user.id, id, dto);
  }

  @UseGuards(AuthSessionGuard, VerifiedEmailGuard)
  @Post('questions/:questionId/answers/:answerId/accept')
  acceptAnswer(
    @Req() request: AuthenticatedRequest,
    @Param('questionId', new ParseUUIDPipe({ version: '4' }))
    questionId: string,
    @Param('answerId', new ParseUUIDPipe({ version: '4' })) answerId: string,
    @Body() dto: AcceptAnswerDto,
  ) {
    return this.qa.acceptAnswer(
      request.user.id,
      questionId,
      answerId,
      dto.expectedRevision,
    );
  }

  @UseGuards(AuthSessionGuard)
  @Post('questions/:id/reports')
  reportQuestion(
    @Req() request: AuthenticatedRequest,
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Body() dto: CreateQaReportDto,
  ) {
    return this.qa.reportQuestion(request.user.id, id, dto.reason, dto.details);
  }

  @UseGuards(AuthSessionGuard)
  @Post('answers/:id/reports')
  reportAnswer(
    @Req() request: AuthenticatedRequest,
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Body() dto: CreateQaReportDto,
  ) {
    return this.qa.reportAnswer(request.user.id, id, dto.reason, dto.details);
  }
}
