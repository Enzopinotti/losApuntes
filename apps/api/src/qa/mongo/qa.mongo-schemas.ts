import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';

import {
  QA_MODERATION_STATES,
  QA_REPORT_REASONS,
  QA_REPORT_STATUSES,
  QUESTION_STATES,
  type QaModerationState,
  type QaReportReason,
  type QaReportStatus,
  type QuestionState,
} from '../domain/qa.types';

@Schema({ collection: 'questions', timestamps: true })
export class Question {
  @Prop({ required: true, unique: true, index: true })
  id!: string;

  @Prop({ required: true, index: true })
  authorUserId!: string;

  @Prop({ required: true, index: true })
  subjectId!: string;

  @Prop({ type: String, default: null, index: true })
  courseOfferingId!: string | null;

  @Prop({ required: true })
  title!: string;

  @Prop({ required: true })
  body!: string;

  @Prop({ required: true })
  searchText!: string;

  @Prop({ required: true, enum: QUESTION_STATES, index: true })
  state!: QuestionState;

  @Prop({ required: true, enum: QA_MODERATION_STATES, index: true })
  moderationState!: QaModerationState;

  @Prop({ required: true, min: 0, default: 0 })
  answerCount!: number;

  @Prop({ type: String, default: null })
  acceptedAnswerId!: string | null;

  @Prop({ required: true, min: 1, default: 1 })
  revision!: number;

  createdAt!: Date;
  updatedAt!: Date;
}

export const QuestionSchema = SchemaFactory.createForClass(Question);
QuestionSchema.index({ moderationState: 1, updatedAt: -1, id: 1 });
QuestionSchema.index({
  subjectId: 1,
  moderationState: 1,
  updatedAt: -1,
  id: 1,
});

@Schema({ collection: 'answers', timestamps: true })
export class Answer {
  @Prop({ required: true, unique: true, index: true })
  id!: string;

  @Prop({ required: true, index: true })
  questionId!: string;

  @Prop({ required: true, index: true })
  authorUserId!: string;

  @Prop({ required: true })
  body!: string;

  @Prop({ required: true, enum: QA_MODERATION_STATES, index: true })
  moderationState!: QaModerationState;

  @Prop({ required: true, min: 1, default: 1 })
  revision!: number;

  createdAt!: Date;
  updatedAt!: Date;
}

export const AnswerSchema = SchemaFactory.createForClass(Answer);
AnswerSchema.index({ questionId: 1, createdAt: 1, id: 1 });

@Schema({ collection: 'qa_reports', timestamps: true })
export class QaReport {
  @Prop({ required: true, unique: true, index: true })
  id!: string;

  @Prop({ required: true, enum: ['question', 'answer'], index: true })
  targetType!: 'question' | 'answer';

  @Prop({ required: true, index: true })
  targetId!: string;

  @Prop({ required: true, index: true })
  reporterUserId!: string;

  @Prop({ required: true, enum: QA_REPORT_REASONS })
  reason!: QaReportReason;

  @Prop({ type: String, default: null })
  details!: string | null;

  @Prop({
    required: true,
    enum: QA_REPORT_STATUSES,
    default: 'pending',
    index: true,
  })
  status!: QaReportStatus;

  @Prop()
  reviewedByUserId?: string;

  @Prop({ type: Date })
  reviewedAt?: Date;

  @Prop()
  reviewReason?: string;

  @Prop({ enum: ['hide', 'restore', 'dismiss'] })
  reviewAction?: 'hide' | 'restore' | 'dismiss';

  createdAt!: Date;
  updatedAt!: Date;
}

export const QaReportSchema = SchemaFactory.createForClass(QaReport);
QaReportSchema.index(
  { targetType: 1, targetId: 1, reporterUserId: 1, status: 1 },
  { unique: true },
);
QaReportSchema.index({ status: 1, createdAt: 1, id: 1 });
