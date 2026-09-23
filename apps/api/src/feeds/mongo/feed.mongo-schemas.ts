import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';

import {
  FEED_FEEDBACK_SIGNALS,
  FEED_TARGET_TYPES,
  type FeedFeedbackSignal,
  type FeedTargetType,
} from '../domain/feed.types';

@Schema({ collection: 'feed_preferences', timestamps: true })
export class FeedPreferences {
  @Prop({ required: true, unique: true, index: true })
  userId!: string;

  @Prop({ required: true, default: true })
  useAcademic!: boolean;

  @Prop({ required: true, default: true })
  useSocial!: boolean;

  @Prop({ required: true, default: true })
  useInterests!: boolean;

  @Prop({ type: [String], default: [] })
  mutedSubjectIds!: string[];

  @Prop({ type: [String], default: [] })
  mutedProfileIds!: string[];

  @Prop({ type: [String], default: [] })
  prioritizedSubjectIds!: string[];

  @Prop({ required: true, min: 1, default: 1 })
  revision!: number;

  createdAt!: Date;
  updatedAt!: Date;
}

export const FeedPreferencesSchema =
  SchemaFactory.createForClass(FeedPreferences);

@Schema({ collection: 'feed_feedback', timestamps: true })
export class FeedFeedback {
  @Prop({ required: true, index: true })
  userId!: string;

  @Prop({ required: true, enum: FEED_TARGET_TYPES })
  targetType!: FeedTargetType;

  @Prop({ required: true })
  targetId!: string;

  @Prop({ required: true, enum: FEED_FEEDBACK_SIGNALS })
  signal!: FeedFeedbackSignal;

  createdAt!: Date;
  updatedAt!: Date;
}

export const FeedFeedbackSchema = SchemaFactory.createForClass(FeedFeedback);
FeedFeedbackSchema.index(
  { userId: 1, targetType: 1, targetId: 1 },
  { unique: true },
);
FeedFeedbackSchema.index({ userId: 1, updatedAt: -1 });
