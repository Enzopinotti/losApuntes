import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { MongooseModule } from '@nestjs/mongoose';

import { AcademicModule } from './academic/academic.module';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { AuthModule } from './auth/auth.module';
import { requireConfigString } from './config/required-config';
import { validateRuntimeEnvironment } from './config/runtime-environment';
import { FeedsModule } from './feeds/feeds.module';
import { FilesModule } from './files/files.module';
import { HealthModule } from './health/health.module';
import { NotificationsModule } from './notifications/notifications.module';
import { OrganizationsModule } from './organizations/organizations.module';
import { PilotModule } from './pilot/pilot.module';
import { ProfileModule } from './profile/profile.module';
import { QaModule } from './qa/qa.module';
import { ResourcesModule } from './resources/resources.module';
import { SearchDiscoveryModule } from './search/search-discovery.module';
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
    AcademicModule,
    ProfileModule,
    FilesModule,
    ResourcesModule,
    SearchDiscoveryModule,
    FeedsModule,
    NotificationsModule,
    OrganizationsModule,
    PilotModule,
    SocialModule,
    QaModule,
    HealthModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
