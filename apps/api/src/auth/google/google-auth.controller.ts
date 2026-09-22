import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpException,
  HttpStatus,
  Post,
  Query,
  Req,
  Res,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { FastifyReply } from 'fastify';

import type { AuthenticatedRequest } from '../auth.types';
import { GoogleMobileDto } from '../dto/google-mobile.dto';
import { GoogleMobileLinkDto } from '../dto/google-mobile-link.dto';
import { GoogleUnlinkDto } from '../dto/google-unlink.dto';
import { GoogleWebCallbackQueryDto } from '../dto/google-web-callback-query.dto';
import { GoogleWebLinkStartDto } from '../dto/google-web-link-start.dto';
import { GoogleWebStartQueryDto } from '../dto/google-web-start-query.dto';
import { AuthSessionGuard } from '../guards/auth-session.guard';
import { AuthNoStoreInterceptor } from '../interceptors/auth-no-store.interceptor';
import {
  getSessionCookieName,
  getSessionCookieOptions,
} from '../session/session-cookie';
import {
  type GoogleLinkOutcome,
  type GoogleLoginOutcome,
  type GoogleUnlinkOutcome,
  GoogleAuthService,
} from './google-auth.service';

function googleError(
  status: HttpStatus,
  code: string,
  message: string,
): HttpException {
  return new HttpException({ code, message }, status);
}

function loginResultOrThrow(outcome: GoogleLoginOutcome) {
  if (outcome.kind === 'authenticated') {
    return outcome;
  }

  if (outcome.kind === 'link_required') {
    throw googleError(
      HttpStatus.CONFLICT,
      'GOOGLE_LINK_REQUIRED',
      'Google must be linked to the existing account',
    );
  }

  if (outcome.kind === 'account_restricted') {
    throw googleError(
      HttpStatus.FORBIDDEN,
      'ACCOUNT_RESTRICTED',
      'Account access is restricted',
    );
  }

  if (outcome.kind === 'identity_already_linked') {
    throw googleError(
      HttpStatus.CONFLICT,
      'GOOGLE_IDENTITY_ALREADY_LINKED',
      'Google identity is already linked',
    );
  }

  if (outcome.kind === 'unavailable') {
    throw googleError(
      HttpStatus.SERVICE_UNAVAILABLE,
      'GOOGLE_AUTH_UNAVAILABLE',
      'Google authentication is unavailable',
    );
  }

  throw googleError(
    HttpStatus.UNAUTHORIZED,
    'GOOGLE_AUTH_FAILED',
    'Google authentication failed',
  );
}

function linkResultOrThrow(outcome: GoogleLinkOutcome): void {
  if (outcome.kind === 'linked' || outcome.kind === 'already_linked') {
    return;
  }

  if (outcome.kind === 'identity_already_linked') {
    throw googleError(
      HttpStatus.CONFLICT,
      'GOOGLE_IDENTITY_ALREADY_LINKED',
      'Google identity is already linked',
    );
  }

  if (outcome.kind === 'reauthentication_required') {
    throw googleError(
      HttpStatus.UNAUTHORIZED,
      'REAUTHENTICATION_REQUIRED',
      'Reauthentication is required',
    );
  }

  if (outcome.kind === 'account_restricted') {
    throw googleError(
      HttpStatus.FORBIDDEN,
      'ACCOUNT_RESTRICTED',
      'Account access is restricted',
    );
  }

  if (outcome.kind === 'unavailable') {
    throw googleError(
      HttpStatus.SERVICE_UNAVAILABLE,
      'GOOGLE_AUTH_UNAVAILABLE',
      'Google authentication is unavailable',
    );
  }

  throw googleError(
    HttpStatus.UNAUTHORIZED,
    'GOOGLE_AUTH_FAILED',
    'Google authentication failed',
  );
}

function unlinkResultOrThrow(outcome: GoogleUnlinkOutcome): void {
  if (outcome.kind === 'unlinked' || outcome.kind === 'not_linked') {
    return;
  }

  if (outcome.kind === 'would_lock_account') {
    throw googleError(
      HttpStatus.CONFLICT,
      'GOOGLE_UNLINK_WOULD_LOCK_ACCOUNT',
      'Another login method is required before Google can be disconnected',
    );
  }

  if (outcome.kind === 'account_restricted') {
    throw googleError(
      HttpStatus.FORBIDDEN,
      'ACCOUNT_RESTRICTED',
      'Account access is restricted',
    );
  }

  throw googleError(
    HttpStatus.UNAUTHORIZED,
    'REAUTHENTICATION_REQUIRED',
    'Reauthentication is required',
  );
}

@Controller('auth')
@UseInterceptors(AuthNoStoreInterceptor)
export class GoogleAuthController {
  constructor(
    private readonly google: GoogleAuthService,
    private readonly config: ConfigService,
  ) {}

  @Get('google/status')
  googleStatus() {
    return this.google.availability();
  }

  @Get('google/web/start')
  async startWeb(
    @Query() query: GoogleWebStartQueryDto,
    @Res() reply: FastifyReply,
  ) {
    const outcome = await this.google.startWebLogin(query.returnTo);

    if (outcome.kind !== 'started') {
      throw googleError(
        HttpStatus.SERVICE_UNAVAILABLE,
        'GOOGLE_AUTH_UNAVAILABLE',
        'Google authentication is unavailable',
      );
    }

    return reply.redirect(outcome.authorizationUrl);
  }

  @UseGuards(AuthSessionGuard)
  @Post('google/web/link/start')
  async startWebLink(
    @Req() request: AuthenticatedRequest,
    @Body() dto: GoogleWebLinkStartDto,
  ) {
    const outcome = await this.google.startWebLink(
      request.user.id,
      dto.currentPassword,
      dto.returnTo,
    );

    if (outcome.kind === 'started') {
      return {
        authorizationUrl: outcome.authorizationUrl,
      };
    }

    if (outcome.kind === 'already_linked') {
      return {
        alreadyLinked: true,
      };
    }

    if (outcome.kind === 'account_restricted') {
      throw googleError(
        HttpStatus.FORBIDDEN,
        'ACCOUNT_RESTRICTED',
        'Account access is restricted',
      );
    }

    if (outcome.kind === 'reauthentication_required') {
      throw googleError(
        HttpStatus.UNAUTHORIZED,
        'REAUTHENTICATION_REQUIRED',
        'Reauthentication is required',
      );
    }

    throw googleError(
      HttpStatus.SERVICE_UNAVAILABLE,
      'GOOGLE_AUTH_UNAVAILABLE',
      'Google authentication is unavailable',
    );
  }

  @Get('google/web/callback')
  async webCallback(
    @Query() query: GoogleWebCallbackQueryDto,
    @Res() reply: FastifyReply,
  ) {
    const outcome = await this.google.completeWebCallback({
      state: query.state,
      code: query.code,
      providerError: query.error,
    });

    let status:
      | 'success'
      | 'linked'
      | 'link_required'
      | 'cancelled'
      | 'account_restricted'
      | 'already_linked'
      | 'failed' = 'failed';

    if (outcome.result.kind === 'authenticated') {
      const nodeEnv = this.config.get<string>('NODE_ENV');
      reply.setCookie(
        getSessionCookieName(nodeEnv),
        outcome.result.sessionToken,
        getSessionCookieOptions(nodeEnv, outcome.result.session.expiresAt),
      );
      status = 'success';
    } else if (outcome.result.kind === 'linked') {
      status = 'linked';
    } else if (outcome.result.kind === 'already_linked') {
      status = 'already_linked';
    } else if (outcome.result.kind === 'link_required') {
      status = 'link_required';
    } else if (outcome.result.kind === 'cancelled') {
      status = 'cancelled';
    } else if (outcome.result.kind === 'account_restricted') {
      status = 'account_restricted';
    }

    return reply.redirect(this.frontendRedirect(outcome.returnPath, status));
  }

  @Post('google/mobile')
  async mobileLogin(@Body() dto: GoogleMobileDto) {
    const result = loginResultOrThrow(
      await this.google.loginMobile(dto.idToken),
    );

    return {
      user: result.user,
      session: result.session,
      sessionToken: result.sessionToken,
    };
  }

  @UseGuards(AuthSessionGuard)
  @Post('google/mobile/link')
  @HttpCode(HttpStatus.NO_CONTENT)
  async mobileLink(
    @Req() request: AuthenticatedRequest,
    @Body() dto: GoogleMobileLinkDto,
  ): Promise<void> {
    linkResultOrThrow(
      await this.google.linkMobile(
        request.user.id,
        dto.currentPassword,
        dto.idToken,
      ),
    );
  }

  @UseGuards(AuthSessionGuard)
  @Get('login-methods')
  async loginMethods(@Req() request: AuthenticatedRequest) {
    const methods = await this.google.loginMethods(request.user.id);

    if (!methods) {
      throw googleError(
        HttpStatus.UNAUTHORIZED,
        'AUTHENTICATION_REQUIRED',
        'Authentication required',
      );
    }

    return methods;
  }

  @UseGuards(AuthSessionGuard)
  @Delete('google')
  @HttpCode(HttpStatus.NO_CONTENT)
  async unlinkGoogle(
    @Req() request: AuthenticatedRequest,
    @Body() dto: GoogleUnlinkDto,
  ): Promise<void> {
    unlinkResultOrThrow(
      await this.google.unlink(request.user.id, dto.currentPassword),
    );
  }

  private frontendRedirect(returnPath: string, status: string): string {
    const origin = this.config.getOrThrow<string>('WEB_ORIGIN');
    const url = new URL(returnPath, origin);

    if (url.origin !== origin) {
      return `${origin}/login?google=failed`;
    }

    url.searchParams.set('google', status);
    return url.toString();
  }
}
