import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';

@Schema({ collection: 'study_progress', timestamps: true })
export class StudyProgress {
  @Prop({ required: true })
  ownerUserId!: string;

  @Prop({ required: true })
  subjectId!: string;

  // Study Session v1: student-authored fields and opaque ids only.
  @Prop({ type: Object, required: true })
  plan!: Record<string, unknown>;

  @Prop({ type: Number, required: true, min: 1 })
  revision!: number;

  createdAt!: Date;
  updatedAt!: Date;
}

export const StudyProgressSchema = SchemaFactory.createForClass(StudyProgress);
StudyProgressSchema.index({ ownerUserId: 1, subjectId: 1 }, { unique: true });
StudyProgressSchema.index({ ownerUserId: 1 });
