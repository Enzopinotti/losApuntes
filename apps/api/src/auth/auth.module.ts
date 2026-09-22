import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { MongooseModule } from '@nestjs/mongoose';

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
import { CsrfOriginGuard } from './guards/csrf-origin.guard';
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
    UsersModule,
    MongooseModule.forFeature([
      { name: AuthSession.name, schema: AuthSessionSchema },
      { name: AuthActionToken.name, schema: AuthActionTokenSchema },
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
    MongoAuthActionTokenStore,
    MongoAuthSessionStore,
    ConfigurableAuthEmailDelivery,
    LoggerAuthAuditSink,
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
      provide: APP_GUARD,
      useClass: CsrfOriginGuard,
    },
  ],
  controllers: [AuthController],
  exports: [AuthService, AuthSessionService, AuthSessionGuard],
})
export class AuthModule {}
