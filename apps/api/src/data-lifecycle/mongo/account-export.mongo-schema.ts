import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';

import {
  ACCOUNT_EXPORT_JOB_STATES,
  type AccountExportJobState,
} from '../domain/account-export.types';

@Schema({ collection: 'account_export_jobs', timestamps: true })
export class AccountExportJob {
  @Prop({ required: true, unique: true, index: true })
  id!: string;

  @Prop({ required: true, index: true })
  userId!: string;

  @Prop({
    required: true,
    enum: ACCOUNT_EXPORT_JOB_STATES,
    index: true,
  })
  state!: AccountExportJobState;

  @Prop({ required: true, index: true })
  active!: boolean;

  @Prop({ required: true, min: 1 })
  formatVersion!: number;

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
  failedAt!: Date | null;

  createdAt!: Date;
  updatedAt!: Date;
}

export const AccountExportJobSchema =
  SchemaFactory.createForClass(AccountExportJob);

AccountExportJobSchema.index(
  { userId: 1, active: 1 },
  {
    unique: true,
    partialFilterExpression: { active: true },
  },
);

AccountExportJobSchema.index({
  active: 1,
  state: 1,
  nextAttemptAt: 1,
  leaseExpiresAt: 1,
  createdAt: 1,
  userId: 1,
});
