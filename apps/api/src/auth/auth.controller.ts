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

import type { AuthenticatedRequest } from './auth.types';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { AuthSessionGuard } from './guards/auth-session.guard';
import { AuthNoStoreInterceptor } from './interceptors/auth-no-store.interceptor';
import { AuthSessionService } from './session/auth-session.service';
import {
  getSessionCookieClearOptions,
  getSessionCookieName,
  getSessionCookieOptions,
} from './session/session-cookie';
import { presentedSessionCredential } from './session/session-credential';

function invalidCredentials(): HttpException {
  return new HttpException(
    {
      code: 'INVALID_CREDENTIALS',
      message: 'Invalid credentials',
    },
    HttpStatus.UNAUTHORIZED,
  );
}

@Controller('auth')
@UseInterceptors(AuthNoStoreInterceptor)
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly sessions: AuthSessionService,
    private readonly config: ConfigService,
  ) {}

  @Post('register')
  @HttpCode(HttpStatus.ACCEPTED)
  async register(@Body() dto: RegisterDto) {
    await this.auth.register(dto);
    return { accepted: true };
  }

  @Post('login')
  async login(
    @Body() dto: LoginDto,
    @Res({ passthrough: true }) reply: FastifyReply,
  ) {
    const result = await this.auth.login(dto, 'web');

    if (!result) {
      throw invalidCredentials();
    }

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
  async mobileLogin(@Body() dto: LoginDto) {
    const result = await this.auth.login(dto, 'mobile');

    if (!result) {
      throw invalidCredentials();
    }

    return result;
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
    await this.sessions.revokeOwned(request.user.id, sessionId);

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

    if (request.authTransport === 'web') {
      const nodeEnv = this.config.get<string>('NODE_ENV');
      reply.clearCookie(
        getSessionCookieName(nodeEnv),
        getSessionCookieClearOptions(nodeEnv),
      );
    }
  }
}
