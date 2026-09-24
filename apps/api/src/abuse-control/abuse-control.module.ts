import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';

import {
  ABUSE_CONTROL_STORE,
} from './domain/abuse-control.store';
import { AbuseControlService } from './domain/abuse-control.service';
import {
  AbuseRateWindow,
  AbuseRateWindowSchema,
} from './mongo/abuse-rate-window.schema';
import { MongoAbuseControlStore } from './mongo/mongo-abuse-control.store';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: AbuseRateWindow.name, schema: AbuseRateWindowSchema },
    ]),
  ],
  providers: [
    AbuseControlService,
    MongoAbuseControlStore,
    {
      provide: ABUSE_CONTROL_STORE,
      useExisting: MongoAbuseControlStore,
    },
  ],
  exports: [AbuseControlService],
})
export class AbuseControlModule {}
