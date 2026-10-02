import {
  Body,
  ConflictException,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { FastifyReply } from 'fastify';

import type { AuthenticatedRequest } from '../auth/auth.types';
import { AuthSessionGuard } from '../auth/guards/auth-session.guard';
import {
  getSessionCookieClearOptions,
  getSessionCookieName,
} from '../auth/session/session-cookie';
import { AccountLifecycleService } from './domain/account-lifecycle.service';
import { CloseAccountDto } from './dto/close-account.dto';

@Controller('account')
export class AccountLifecycleController {
  constructor(
    private readonly lifecycle: AccountLifecycleService,
    private readonly config: ConfigService,
  ) {}

  @UseGuards(AuthSessionGuard)
  @Get('closure/preflight')
  preflight(@Req() request: AuthenticatedRequest) {
    return this.lifecycle.preflight(request.user.id);
  }

  @UseGuards(AuthSessionGuard)
  @Post('closure')
  @HttpCode(HttpStatus.ACCEPTED)
  async close(
    @Req() request: AuthenticatedRequest,
    @Body() dto: CloseAccountDto,
    @Res({ passthrough: true }) reply: FastifyReply,
  ) {
    const outcome = await this.lifecycle.close(
      request.user.id,
      request.authCredentialVersion,
      dto.currentPassword,
    );

    if (outcome.kind === 'invalid_current_password') {
      throw new ConflictException({
        code: 'ACCOUNT_CLOSURE_REAUTHENTICATION_FAILED',
        message: 'Current password is not valid',
      });
    }
    if (outcome.kind === 'reauthentication_unavailable') {
      throw new ConflictException({
        code: 'ACCOUNT_CLOSURE_REAUTHENTICATION_UNAVAILABLE',
        message: 'This login method cannot complete account closure yet',
      });
    }
    if (outcome.kind === 'management_blocked') {
      throw new ConflictException({
        code: 'ACCOUNT_CLOSURE_MANAGEMENT_BLOCKED',
        message:
          'Leave or transfer all Organization management roles before closing the account',
      });
    }
    if (outcome.kind === 'conflict') {
      throw new ConflictException({
        code: 'ACCOUNT_CLOSURE_CONFLICT',
        message: 'Account authority changed concurrently',
      });
    }

    if (request.authTransport === 'web') {
      const nodeEnv = this.config.get<string>('NODE_ENV');
      reply.clearCookie(
        getSessionCookieName(nodeEnv),
        getSessionCookieClearOptions(nodeEnv),
      );
    }

    return { accepted: true, cleanupJobId: outcome.cleanupJobId };
  }
}
