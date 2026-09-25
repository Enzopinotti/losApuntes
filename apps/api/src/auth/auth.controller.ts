import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpException,
  HttpStatus,
  Param,
  Post,
  Req,
  Res,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { FastifyReply, FastifyRequest } from 'fastify';

import { AccountSecurityService } from './account-security.service';
import { AuthAbuseService } from './abuse/auth-abuse.service';
import { AuthAuditService } from './audit/auth-audit.service';
import type { AuthenticatedRequest } from './auth.types';
import {
  type AuthenticatedLoginOutcome,
  type AuthLoginOutcome,
  AuthService,
} from './auth.service';
import { ActionTokenDto } from './dto/action-token.dto';
import { EmailAddressDto } from './dto/email-address.dto';
import { LoginDto } from './dto/login.dto';
import { PasswordChangeDto } from './dto/password-change.dto';
import { PasswordRecoveryCompleteDto } from './dto/password-recovery-complete.dto';
import { RegisterDto } from './dto/register.dto';
import { AuthSessionGuard } from './guards/auth-session.guard';
import { AuthNoStoreInterceptor } from './interceptors/auth-no-store.interceptor';
import { AuthEmailDeliveryUnavailableError } from './lifecycle/auth-lifecycle.errors';
import { AuthLifecycleService } from './lifecycle/auth-lifecycle.service';
import { AuthSessionService } from './session/auth-session.service';
import {
  getSessionCookieClearOptions,
  getSessionCookieName,
  getSessionCookieOptions,
} from './session/session-cookie';
import { presentedSessionCredential } from './session/session-credential';

function authError(
  status: HttpStatus,
  code: string,
  message: string,
): HttpException {
  return new HttpException({ code, message }, status);
}

function authenticatedOutcome(
  outcome: AuthLoginOutcome,
): AuthenticatedLoginOutcome {
  if (outcome.kind === 'invalid_credentials') {
    throw authError(
      HttpStatus.UNAUTHORIZED,
      'INVALID_CREDENTIALS',
      'Invalid credentials',
    );
  }

  if (outcome.kind === 'account_restricted') {
    throw authError(
      HttpStatus.FORBIDDEN,
      'ACCOUNT_RESTRICTED',
      'Account access is restricted',
    );
  }

  if (outcome.kind === 'email_verification_required') {
    throw authError(
      HttpStatus.FORBIDDEN,
      'EMAIL_VERIFICATION_REQUIRED',
      'Email verification required',
    );
  }

  return outcome;
}

function unavailable(
  code: 'VERIFICATION_NOT_AVAILABLE' | 'RECOVERY_NOT_AVAILABLE',
): HttpException {
  return authError(HttpStatus.GONE, code, 'Action link is not available');
}

@Controller('auth')
@UseInterceptors(AuthNoStoreInterceptor)
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly abuse: AuthAbuseService,
    private readonly lifecycle: AuthLifecycleService,
    private readonly security: AccountSecurityService,
    private readonly sessions: AuthSessionService,
    private readonly audit: AuthAuditService,
    private readonly config: ConfigService,
  ) {}

  @Post('register')
  @HttpCode(HttpStatus.ACCEPTED)
  async register(@Req() request: FastifyRequest, @Body() dto: RegisterDto) {
    await this.abuse.admit('registration', request.ip, dto.email);

    try {
      await this.auth.register(dto);
    } catch (error) {
      if (!(error instanceof AuthEmailDeliveryUnavailableError)) {
        throw error;
      }
    }

    return { accepted: true };
  }

  @Post('email-verification/request')
  @HttpCode(HttpStatus.ACCEPTED)
  async requestEmailVerification(
    @Req() request: FastifyRequest,
    @Body() dto: EmailAddressDto,
  ) {
    await this.abuse.admit('verification_request', request.ip, dto.email);

    try {
      await this.lifecycle.requestEmailVerification(dto.email);
    } catch (error) {
      if (!(error instanceof AuthEmailDeliveryUnavailableError)) {
        throw error;
      }
    }

    return { accepted: true };
  }

  @Post('email-verification/inspect')
  @HttpCode(HttpStatus.OK)
  async inspectEmailVerification(@Body() dto: ActionTokenDto) {
    if (!(await this.lifecycle.inspectEmailVerification(dto.token))) {
      throw unavailable('VERIFICATION_NOT_AVAILABLE');
    }

    return {
      verification: {
        available: true,
      },
    };
  }

  @Post('email-verification/complete')
  @HttpCode(HttpStatus.NO_CONTENT)
  async completeEmailVerification(@Body() dto: ActionTokenDto): Promise<void> {
    if (!(await this.lifecycle.completeEmailVerification(dto.token))) {
      throw unavailable('VERIFICATION_NOT_AVAILABLE');
    }
  }

  @Post('password/recovery/request')
  @HttpCode(HttpStatus.ACCEPTED)
  async requestPasswordRecovery(
    @Req() request: FastifyRequest,
    @Body() dto: EmailAddressDto,
  ) {
    await this.abuse.admit('recovery_request', request.ip, dto.email);

    try {
      await this.lifecycle.requestPasswordRecovery(dto.email);
    } catch (error) {
      if (!(error instanceof AuthEmailDeliveryUnavailableError)) {
        throw error;
      }
    }

    return { accepted: true };
  }

  @Post('password/recovery/inspect')
  @HttpCode(HttpStatus.OK)
  async inspectPasswordRecovery(@Body() dto: ActionTokenDto) {
    if (!(await this.lifecycle.inspectPasswordRecovery(dto.token))) {
      throw unavailable('RECOVERY_NOT_AVAILABLE');
    }

    return {
      recovery: {
        available: true,
      },
    };
  }

  @Post('password/recovery/complete')
  @HttpCode(HttpStatus.NO_CONTENT)
  async completePasswordRecovery(
    @Body() dto: PasswordRecoveryCompleteDto,
  ): Promise<void> {
    if (
      !(await this.lifecycle.completePasswordRecovery(
        dto.token,
        dto.newPassword,
      ))
    ) {
      throw unavailable('RECOVERY_NOT_AVAILABLE');
    }
  }

  @UseGuards(AuthSessionGuard)
  @Post('password/change')
  @HttpCode(HttpStatus.NO_CONTENT)
  async changePassword(
    @Req() request: AuthenticatedRequest,
    @Body() dto: PasswordChangeDto,
    @Res({ passthrough: true }) reply: FastifyReply,
  ): Promise<void> {
    const outcome = await this.security.changePassword(
      request.user.id,
      request.authCredentialVersion,
      dto.currentPassword,
      dto.newPassword,
    );

    if (outcome.kind === 'invalid_current_password') {
      throw authError(
        HttpStatus.BAD_REQUEST,
        'INVALID_CURRENT_PASSWORD',
        'Current password is not valid',
      );
    }

    if (outcome.kind === 'account_restricted') {
      throw authError(
        HttpStatus.FORBIDDEN,
        'ACCOUNT_RESTRICTED',
        'Account access is restricted',
      );
    }

    if (outcome.kind === 'conflict') {
      throw authError(
        HttpStatus.CONFLICT,
        'PASSWORD_CHANGE_CONFLICT',
        'Account credentials changed concurrently',
      );
    }

    if (request.authTransport === 'web') {
      const nodeEnv = this.config.get<string>('NODE_ENV');
      reply.clearCookie(
        getSessionCookieName(nodeEnv),
        getSessionCookieClearOptions(nodeEnv),
      );
    }
  }

  @Post('login')
  @HttpCode(HttpStatus.OK)
  async login(
    @Req() request: FastifyRequest,
    @Body() dto: LoginDto,
    @Res({ passthrough: true }) reply: FastifyReply,
  ) {
    await this.abuse.admitLoginOrigin(request.ip);
    const outcome = await this.auth.login(dto, 'web');

    if (outcome.kind === 'invalid_credentials') {
      await this.abuse.recordInvalidLogin(request.ip, dto.email);
    }

    const result = authenticatedOutcome(outcome);

    const nodeEnv = this.config.get<string>('NODE_ENV');
    reply.setCookie(
      getSessionCookieName(nodeEnv),
      result.sessionToken,
      getSessionCookieOptions(nodeEnv, result.session.expiresAt),
    );

    return {
      user: result.user,
      session: result.session,
    };
  }

  @Post('mobile/login')
  @HttpCode(HttpStatus.OK)
  async mobileLogin(@Req() request: FastifyRequest, @Body() dto: LoginDto) {
    await this.abuse.admitLoginOrigin(request.ip);
    const outcome = await this.auth.login(dto, 'mobile');

    if (outcome.kind === 'invalid_credentials') {
      await this.abuse.recordInvalidLogin(request.ip, dto.email);
    }

    const result = authenticatedOutcome(outcome);

    return {
      user: result.user,
      session: result.session,
      sessionToken: result.sessionToken,
    };
  }

  @UseGuards(AuthSessionGuard)
  @Get('me')
  me(@Req() request: AuthenticatedRequest) {
    return {
      user: request.user,
      session: request.authSession,
    };
  }

  @Delete('session')
  @HttpCode(HttpStatus.NO_CONTENT)
  async logout(
    @Req() request: FastifyRequest,
    @Res({ passthrough: true }) reply: FastifyReply,
  ): Promise<void> {
    const nodeEnv = this.config.get<string>('NODE_ENV');
    const cookieName = getSessionCookieName(nodeEnv);
    const credential = presentedSessionCredential(request, cookieName);

    if (credential) {
      await this.sessions.revokeCurrent(credential.sessionToken);
    }

    reply.clearCookie(cookieName, getSessionCookieClearOptions(nodeEnv));
  }

  @UseGuards(AuthSessionGuard)
  @Get('sessions')
  async listSessions(@Req() request: AuthenticatedRequest) {
    return {
      sessions: await this.sessions.listForUser(
        request.user.id,
        request.authSession.id,
        request.authCredentialVersion,
      ),
    };
  }

  @UseGuards(AuthSessionGuard)
  @Delete('sessions/:sessionId')
  @HttpCode(HttpStatus.NO_CONTENT)
  async revokeSession(
    @Req() request: AuthenticatedRequest,
    @Param('sessionId') sessionId: string,
    @Res({ passthrough: true }) reply: FastifyReply,
  ): Promise<void> {
    const revoked = await this.sessions.revokeOwned(request.user.id, sessionId);

    if (revoked) {
      await this.audit.record({
        event: 'auth.session.revoked',
        userId: request.user.id,
        sessionId,
        clientType: request.authTransport,
      });
    }

    if (
      request.authTransport === 'web' &&
      request.authSession.id === sessionId
    ) {
      const nodeEnv = this.config.get<string>('NODE_ENV');
      reply.clearCookie(
        getSessionCookieName(nodeEnv),
        getSessionCookieClearOptions(nodeEnv),
      );
    }
  }

  @UseGuards(AuthSessionGuard)
  @Delete('sessions')
  @HttpCode(HttpStatus.NO_CONTENT)
  async revokeAll(
    @Req() request: AuthenticatedRequest,
    @Res({ passthrough: true }) reply: FastifyReply,
  ): Promise<void> {
    await this.sessions.revokeAll(request.user.id);

    await this.audit.record({
      event: 'auth.session.revoked_all',
      userId: request.user.id,
      clientType: request.authTransport,
    });

    if (request.authTransport === 'web') {
      const nodeEnv = this.config.get<string>('NODE_ENV');
      reply.clearCookie(
        getSessionCookieName(nodeEnv),
        getSessionCookieClearOptions(nodeEnv),
      );
    }
  }
}
