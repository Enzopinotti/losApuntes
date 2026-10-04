import { Module } from '@nestjs/common';

import { FilesModule } from '../files/files.module';
import { HealthController } from './health.controller';
import { HealthService } from './health.service';
import { ReleaseIdentityService } from './release-identity.service';

@Module({
  imports: [FilesModule],
  controllers: [HealthController],
  providers: [HealthService, ReleaseIdentityService],
  exports: [HealthService],
})
export class HealthModule {}
