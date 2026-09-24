import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';

import {
  PILOT_MODERATION_ACTIONS,
  type PilotModerationAction,
  type PilotModerationTargetKind,
  type PilotReportKind,
} from '../domain/pilot.types';

@Schema({ collection: 'pilot_moderation_actions', timestamps: false })
export class PilotModerationAudit {
  @Prop({ required: true, unique: true, index: true })
  id!: string;

  @Prop({ required: true, index: true })
  operatorUserId!: string;

  @Prop({
    required: true,
    enum: ['resource', 'qa', 'organization'],
    index: true,
  })
  reportKind!: PilotReportKind;

  @Prop({ required: true, index: true })
  reportId!: string;

  @Prop({
    required: true,
    enum: [
      'resource',
      'question',
      'answer',
      'organization_post',
      'organization_event',
    ],
    index: true,
  })
  targetKind!: PilotModerationTargetKind;

  @Prop({ required: true, index: true })
  targetId!: string;

  @Prop({ required: true, enum: PILOT_MODERATION_ACTIONS })
  action!: PilotModerationAction;

  @Prop({ required: true })
  reason!: string;

  @Prop({ required: true, type: Date, index: true })
  createdAt!: Date;
}

export const PilotModerationAuditSchema =
  SchemaFactory.createForClass(PilotModerationAudit);

PilotModerationAuditSchema.index(
  { reportKind: 1, reportId: 1 },
  { unique: true },
);
