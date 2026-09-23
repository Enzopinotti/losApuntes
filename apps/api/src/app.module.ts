import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { MongooseModule } from '@nestjs/mongoose';

import { AcademicModule } from './academic/academic.module';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { AuthModule } from './auth/auth.module';
import { requireConfigString } from './config/required-config';
import { validateRuntimeEnvironment } from './config/runtime-environment';
import { FilesModule } from './files/files.module';
import { HealthModule } from './health/health.module';
import { ProfileModule } from './profile/profile.module';
import { ResourcesModule } from './resources/resources.module';
import { SearchDiscoveryModule } from './search/search-discovery.module';
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
    HealthModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
