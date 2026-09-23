import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';

import { AcademicModule } from '../academic/academic.module';
import { AuthModule } from '../auth/auth.module';
import { FeedsModule } from '../feeds/feeds.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { ProfileModule } from '../profile/profile.module';
import { UsersModule } from '../users/users.module';
import { PILOT_STORE } from './domain/pilot.store';
import { PilotService } from './domain/pilot.service';
import { ModerationWriteGuard } from './guards/moderation-write.guard';
import { PilotOpsReadGuard } from './guards/pilot-ops-read.guard';
import { MongoPilotStore } from './mongo/mongo-pilot.store';
import {
  PilotModerationAudit,
  PilotModerationAuditSchema,
} from './mongo/pilot.mongo-schemas';
import { PilotController } from './pilot.controller';
import { PilotTelemetryModule } from './telemetry/pilot-telemetry.module';

@Module({
  imports: [
    AuthModule,
    UsersModule,
    AcademicModule,
    ProfileModule,
    FeedsModule,
    NotificationsModule,
    PilotTelemetryModule,
    MongooseModule.forFeature([
      {
        name: PilotModerationAudit.name,
        schema: PilotModerationAuditSchema,
      },
    ]),
  ],
  providers: [
    PilotService,
    PilotOpsReadGuard,
    ModerationWriteGuard,
    MongoPilotStore,
    {
      provide: PILOT_STORE,
      useExisting: MongoPilotStore,
    },
  ],
  controllers: [PilotController],
  exports: [PilotService],
})
export class PilotModule {}
