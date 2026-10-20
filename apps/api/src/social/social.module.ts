import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';

import { AuthModule } from '../auth/auth.module';
import {
  Notification,
  NotificationSchema,
} from '../notifications/mongo/notification.mongo-schema';
import { PilotTelemetryModule } from '../pilot/telemetry/pilot-telemetry.module';
import { ProfileModule } from '../profile/profile.module';
import { User, UserSchema } from '../users/schemas/user.schema';
import { UsersModule } from '../users/users.module';
import { FollowersService } from './domain/followers.service';
import { SocialService } from './domain/social.service';
import { SOCIAL_STORE } from './domain/social.store';
import { MongoSocialStore } from './mongo/mongo-social.store';
import {
  SocialConnection,
  SocialConnectionSchema,
  SocialFollow,
  SocialFollowSchema,
} from './mongo/social.mongo-schemas';
import { FollowersController } from './followers.controller';
import { SocialController } from './social.controller';

// Register this index before Mongoose compiles the existing SocialFollow schema.
// Kept in this module to avoid editing the independently changing B147 schema.
SocialFollowSchema.index({ followeeUserId: 1, createdAt: -1, id: 1 });

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
      { name: User.name, schema: UserSchema },
    ]),
  ],
  providers: [
    FollowersService,
    SocialService,
    MongoSocialStore,
    {
      provide: SOCIAL_STORE,
      useExisting: MongoSocialStore,
    },
  ],
  controllers: [SocialController, FollowersController],
  exports: [SocialService],
})
export class SocialModule {}
