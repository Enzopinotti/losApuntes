import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { MongooseModule } from '@nestjs/mongoose';

import { AcademicModule } from './academic/academic.module';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { AuthModule } from './auth/auth.module';
import { requireConfigString } from './config/required-config';
import { validateRuntimeEnvironment } from './config/runtime-environment';
import { DataLifecycleModule } from './data-lifecycle/data-lifecycle.module';
import { FeedsModule } from './feeds/feeds.module';
import { FilesModule } from './files/files.module';
import { HealthModule } from './health/health.module';
import { NotificationsModule } from './notifications/notifications.module';
import { OrganizationsModule } from './organizations/organizations.module';
import { PilotModule } from './pilot/pilot.module';
import { ProfileModule } from './profile/profile.module';
import { QaSolvedLibraryModule } from './qa-solved-library/qa-solved-library.module';
import { QaCardStatusModule } from './qa-card-status/qa-card-status.module';
import { QaHelpOpportunitiesModule } from './qa-help-opportunities/qa-help-opportunities.module';
import { QaNeedsHelpModule } from './qa-needs-help/qa-needs-help.module';
import { QaActivityCalendarModule } from './qa-calendar/qa-activity-calendar.module';
import { QaModule } from './qa/qa.module';
import { ResourcesModule } from './resources/resources.module';
import { SearchDiscoveryModule } from './search/search-discovery.module';
import { StudyAgendaModule } from './study-agenda/study-agenda.module';
import { StudyCalendarModule } from './study-calendar/study-calendar.module';
import { StudyNextActionsModule } from './study-next-actions/study-next-actions.module';
import { StudyCollectionsModule } from './study-collections/study-collections.module';
import { StudyProgressModule } from './study-progress/study-progress.module';
import { SocialModule } from './social/social.module';
import { UsersModule } from './users/users.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      validate: validateRuntimeEnvironment,
    }),
    MongooseModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        uri: requireConfigString(config, 'MONGO_URI'),
      }),
    }),
    AuthModule,
    UsersModule,
    DataLifecycleModule,
    AcademicModule,
    ProfileModule,
    FilesModule,
    ResourcesModule,
    SearchDiscoveryModule,
    StudyCollectionsModule,
    StudyProgressModule,
    StudyAgendaModule,
    StudyCalendarModule,
    StudyNextActionsModule,
    FeedsModule,
    NotificationsModule,
    OrganizationsModule,
    PilotModule,
    SocialModule,
    QaModule,
    QaSolvedLibraryModule,
    QaCardStatusModule,
    QaHelpOpportunitiesModule,
    QaNeedsHelpModule,
    QaActivityCalendarModule,
    HealthModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
