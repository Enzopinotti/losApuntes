import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';

import { AuthModule } from '../auth/auth.module';
import {
  Notification,
  NotificationSchema,
} from '../notifications/mongo/notification.mongo-schema';
import { PilotTelemetryModule } from '../pilot/telemetry/pilot-telemetry.module';
import { ProfileModule } from '../profile/profile.module';
import { UsersModule } from '../users/users.module';
import { SocialService } from './domain/social.service';
import { SOCIAL_STORE } from './domain/social.store';
import { MongoSocialStore } from './mongo/mongo-social.store';
import {
  SocialConnection,
  SocialConnectionSchema,
  SocialFollow,
  SocialFollowSchema,
} from './mongo/social.mongo-schemas';
import { SocialController } from './social.controller';

@Module({
  imports: [
    AuthModule,
    UsersModule,
    ProfileModule,
    PilotTelemetryModule,
    MongooseModule.forFeature([
      { name: SocialFollow.name, schema: SocialFollowSchema },
      { name: SocialConnection.name, schema: SocialConnectionSchema },
      { name: Notification.name, schema: NotificationSchema },
    ]),
  ],
  providers: [
    SocialService,
    MongoSocialStore,
    {
      provide: SOCIAL_STORE,
      useExisting: MongoSocialStore,
    },
  ],
  controllers: [SocialController],
  exports: [SocialService],
})
export class SocialModule {}
