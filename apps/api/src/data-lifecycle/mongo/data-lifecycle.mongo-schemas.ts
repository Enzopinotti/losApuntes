import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';

import type { AccountOffboardingJobState } from '../domain/account-lifecycle.types';

@Schema({ collection: 'account_offboarding_jobs', timestamps: true })
export class AccountOffboardingJob {
  @Prop({ required: true, unique: true, index: true })
  id!: string;

  @Prop({ required: true, unique: true, index: true })
  userId!: string;

  @Prop({
    required: true,
    enum: ['pending', 'processing', 'completed', 'failed'],
    index: true,
  })
  state!: AccountOffboardingJobState;

  @Prop({ required: true, min: 0, default: 0 })
  attempts!: number;

  @Prop({ required: true, type: Date, index: true })
  nextAttemptAt!: Date;

  @Prop({ type: String, default: null, index: true })
  claimId!: string | null;

  @Prop({ type: Date, default: null, index: true })
  leaseExpiresAt!: Date | null;

  @Prop({ type: String, default: null })
  failureCode!: string | null;

  @Prop({ type: Date, default: null })
  completedAt!: Date | null;

  createdAt!: Date;
  updatedAt!: Date;
}

export const AccountOffboardingJobSchema =
  SchemaFactory.createForClass(AccountOffboardingJob);
AccountOffboardingJobSchema.index({
  state: 1,
  nextAttemptAt: 1,
  leaseExpiresAt: 1,
  createdAt: 1,
});

@Schema({ collection: 'security_audit' })
export class SecurityAudit {
  @Prop({ required: true, unique: true, index: true })
  id!: string;

  @Prop({ required: true, enum: ['account.closed'], index: true })
  event!: 'account.closed';

  @Prop({ required: true, index: true })
  actorUserId!: string;

  @Prop({ required: true, index: true })
  subjectUserId!: string;

  @Prop({ required: true, type: Object, default: {} })
  metadata!: Record<string, string | number | boolean | null>;

  @Prop({ required: true, type: Date, index: true })
  createdAt!: Date;
}

export const SecurityAuditSchema = SchemaFactory.createForClass(SecurityAudit);
SecurityAuditSchema.index({ subjectUserId: 1, createdAt: -1, id: 1 });
