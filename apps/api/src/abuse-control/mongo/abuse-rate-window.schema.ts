import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';

@Schema({ collection: 'abuse_rate_windows', versionKey: false })
export class AbuseRateWindow {
  @Prop({ required: true, unique: true })
  key!: string;

  @Prop({ required: true, index: true })
  scope!: string;

  @Prop({ required: true, min: 1 })
  count!: number;

  @Prop({ required: true, type: Date })
  windowStartedAt!: Date;

  @Prop({ required: true, type: Date })
  expiresAt!: Date;
}

export const AbuseRateWindowSchema =
  SchemaFactory.createForClass(AbuseRateWindow);

AbuseRateWindowSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
