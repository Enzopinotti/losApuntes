import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { MongooseModule } from '@nestjs/mongoose';

import { AbuseControlModule } from '../abuse-control/abuse-control.module';
import { UsersModule } from '../users/users.module';
import { AuthActionTokenService } from './action-token/auth-action-token.service';
import { AUTH_ACTION_TOKEN_STORE } from './action-token/auth-action-token.types';
import { MongoAuthActionTokenStore } from './action-token/mongo-auth-action-token.store';
import {
  AuthActionToken,
  AuthActionTokenSchema,
} from './action-token/schemas/auth-action-token.schema';
import { AccountSecurityService } from './account-security.service';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { AuthAuditService } from './audit/auth-audit.service';
import { AUTH_AUDIT_SINK } from './audit/auth-audit.types';
import { LoggerAuthAuditSink } from './audit/logger-auth-audit.sink';
import { AUTH_EMAIL_DELIVERY } from './delivery/auth-email-delivery.types';
import { ConfigurableAuthEmailDelivery } from './delivery/configurable-auth-email.delivery';
import { AuthSessionGuard } from './guards/auth-session.guard';
import { OptionalAuthSessionGuard } from './guards/optional-auth-session.guard';
import { VerifiedEmailGuard } from './guards/verified-email.guard';
import { CsrfOriginGuard } from './guards/csrf-origin.guard';
import { GoogleAuthController } from './google/google-auth.controller';
import { GoogleAuthService } from './google/google-auth.service';
import { GoogleIdentityService } from './google/google-identity.service';
import { GoogleOAuthAttemptService } from './google/google-oauth-attempt.service';
import {
  GOOGLE_EXTERNAL_IDENTITY_STORE,
  GOOGLE_IDENTITY_PROVIDER,
  GOOGLE_OAUTH_ATTEMPT_STORE,
} from './google/google.types';
import { MongoGoogleExternalIdentityStore } from './google/mongo-google-identity.store';
import { MongoGoogleOAuthAttemptStore } from './google/mongo-google-oauth-attempt.store';
import { OfficialGoogleIdentityProvider } from './google/official-google-identity.provider';
import {
  GoogleExternalIdentity,
  GoogleExternalIdentitySchema,
} from './google/schemas/google-external-identity.schema';
import {
  GoogleOAuthAttempt,
  GoogleOAuthAttemptSchema,
} from './google/schemas/google-oauth-attempt.schema';
import { AuthLifecycleService } from './lifecycle/auth-lifecycle.service';
import { PasswordService } from './password.service';
import { AuthSessionService } from './session/auth-session.service';
import { AUTH_SESSION_STORE } from './session/auth-session.types';
import { MongoAuthSessionStore } from './session/mongo-auth-session.store';
import {
  AuthSession,
  AuthSessionSchema,
} from './session/schemas/auth-session.schema';

@Module({
  imports: [
    AbuseControlModule,
    UsersModule,
    MongooseModule.forFeature([
      { name: AuthSession.name, schema: AuthSessionSchema },
      { name: AuthActionToken.name, schema: AuthActionTokenSchema },
      {
        name: GoogleExternalIdentity.name,
        schema: GoogleExternalIdentitySchema,
      },
      {
        name: GoogleOAuthAttempt.name,
        schema: GoogleOAuthAttemptSchema,
      },
    ]),
  ],
  providers: [
    AuthService,
    AccountSecurityService,
    AuthLifecycleService,
    AuthAuditService,
    AuthActionTokenService,
    PasswordService,
    AuthSessionService,
    AuthSessionGuard,
    OptionalAuthSessionGuard,
    VerifiedEmailGuard,
    GoogleAuthService,
    GoogleIdentityService,
    GoogleOAuthAttemptService,
    MongoAuthActionTokenStore,
    MongoAuthSessionStore,
    MongoGoogleExternalIdentityStore,
    MongoGoogleOAuthAttemptStore,
    ConfigurableAuthEmailDelivery,
    LoggerAuthAuditSink,
    OfficialGoogleIdentityProvider,
    {
      provide: AUTH_AUDIT_SINK,
      useExisting: LoggerAuthAuditSink,
    },
    {
      provide: AUTH_ACTION_TOKEN_STORE,
      useExisting: MongoAuthActionTokenStore,
    },
    {
      provide: AUTH_SESSION_STORE,
      useExisting: MongoAuthSessionStore,
    },
    {
      provide: AUTH_EMAIL_DELIVERY,
      useExisting: ConfigurableAuthEmailDelivery,
    },
    {
      provide: GOOGLE_IDENTITY_PROVIDER,
      useExisting: OfficialGoogleIdentityProvider,
    },
    {
      provide: GOOGLE_EXTERNAL_IDENTITY_STORE,
      useExisting: MongoGoogleExternalIdentityStore,
    },
    {
      provide: GOOGLE_OAUTH_ATTEMPT_STORE,
      useExisting: MongoGoogleOAuthAttemptStore,
    },
    {
      provide: APP_GUARD,
      useClass: CsrfOriginGuard,
    },
  ],
  controllers: [AuthController, GoogleAuthController],
  exports: [
    AuthService,
    AuthSessionService,
    AuthSessionGuard,
    OptionalAuthSessionGuard,
    VerifiedEmailGuard,
  ],
})
export class AuthModule {}
