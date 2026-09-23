import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';

import { PILOT_EVENT_STORE } from './pilot-event.store';
import { PilotEventService } from './pilot-event.service';
import { PilotEvent, PilotEventSchema } from './mongo/pilot-event.mongo-schema';
import { MongoPilotEventStore } from './mongo/mongo-pilot-event.store';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: PilotEvent.name, schema: PilotEventSchema },
    ]),
  ],
  providers: [
    PilotEventService,
    MongoPilotEventStore,
    {
      provide: PILOT_EVENT_STORE,
      useExisting: MongoPilotEventStore,
    },
  ],
  exports: [PilotEventService, MongooseModule],
})
export class PilotTelemetryModule {}
