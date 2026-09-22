import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { MongooseModule } from '@nestjs/mongoose';

import { UsersModule } from '../users/users.module';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { AuthSessionGuard } from './guards/auth-session.guard';
import { CsrfOriginGuard } from './guards/csrf-origin.guard';
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
    ]),
  ],
  providers: [
    AuthService,
    AuthSessionService,
    AuthSessionGuard,
    MongoAuthSessionStore,
    {
      provide: AUTH_SESSION_STORE,
      useExisting: MongoAuthSessionStore,
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
