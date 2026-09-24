import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';

import { AcademicModule } from '../academic/academic.module';
import { AuthModule } from '../auth/auth.module';
import { OrganizationsModule } from '../organizations/organizations.module';
import { ProfileModule } from '../profile/profile.module';
import { QaModule } from '../qa/qa.module';
import { ResourcesModule } from '../resources/resources.module';
import { SocialModule } from '../social/social.module';
import { UsersModule } from '../users/users.module';
import { FeedService } from './domain/feed.service';
import { FEED_STORE } from './domain/feed.store';
import { FeedsController } from './feeds.controller';
import {
  FeedFeedback,
  FeedFeedbackSchema,
  FeedPreferences,
  FeedPreferencesSchema,
} from './mongo/feed.mongo-schemas';
import { MongoFeedStore } from './mongo/mongo-feed.store';

@Module({
  imports: [
    AuthModule,
    UsersModule,
    AcademicModule,
    ProfileModule,
    ResourcesModule,
    OrganizationsModule,
    QaModule,
    SocialModule,
    MongooseModule.forFeature([
      { name: FeedPreferences.name, schema: FeedPreferencesSchema },
      { name: FeedFeedback.name, schema: FeedFeedbackSchema },
    ]),
  ],
  providers: [
    FeedService,
    MongoFeedStore,
    {
      provide: FEED_STORE,
      useExisting: MongoFeedStore,
    },
  ],
  controllers: [FeedsController],
  exports: [FeedService],
})
export class FeedsModule {}
