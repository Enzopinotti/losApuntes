import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';

import { PILOT_EVENT_NAMES, type PilotEventName } from '../pilot-event.types';

@Schema({ collection: 'pilot_events', timestamps: false })
export class PilotEvent {
  @Prop({ required: true, unique: true, index: true })
  id!: string;

  @Prop({ required: true, enum: PILOT_EVENT_NAMES, index: true })
  event!: PilotEventName;

  @Prop({ index: true })
  userId?: string;

  @Prop({ index: true })
  subjectId?: string;

  @Prop({ min: 0 })
  resultCount?: number;

  @Prop({ required: true, type: Date, index: true })
  createdAt!: Date;
}

export const PilotEventSchema = SchemaFactory.createForClass(PilotEvent);
PilotEventSchema.index({ event: 1, createdAt: -1 });
PilotEventSchema.index({ userId: 1, createdAt: -1 });
PilotEventSchema.index({ subjectId: 1, createdAt: -1 });
