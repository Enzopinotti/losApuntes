import { Module } from '@nestjs/common';

import { AcademicModule } from '../academic/academic.module';
import { AuthModule } from '../auth/auth.module';
import { PilotTelemetryModule } from '../pilot/telemetry/pilot-telemetry.module';
import { ProfileModule } from '../profile/profile.module';
import { ResourcesModule } from '../resources/resources.module';
import { UsersModule } from '../users/users.module';
import { SearchDiscoveryService } from './domain/search-discovery.service';
import { SearchDiscoveryController } from './search-discovery.controller';

@Module({
  imports: [
    AuthModule,
    UsersModule,
    AcademicModule,
    ProfileModule,
    PilotTelemetryModule,
    ResourcesModule,
  ],
  providers: [SearchDiscoveryService],
  controllers: [SearchDiscoveryController],
})
export class SearchDiscoveryModule {}
