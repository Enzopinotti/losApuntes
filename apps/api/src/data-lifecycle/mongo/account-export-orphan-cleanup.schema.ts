import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';

@Schema({ collection: 'account_export_orphan_cleanup', timestamps: true })
export class AccountExportOrphanCleanup {
  @Prop({ required: true })
  jobId!: string;

  @Prop({ required: true })
  ownerUserId!: string;

  @Prop({ required: true })
  generation!: string;

  @Prop({ required: true, enum: ['pending', 'processing'] })
  state!: 'pending' | 'processing';

  @Prop({ required: true, min: 0, default: 0 })
  attempts!: number;

  @Prop({ required: true, type: Date })
  nextAttemptAt!: Date;

  @Prop({ type: String, default: null })
  claimId!: string | null;

  @Prop({ type: Date, default: null })
  leaseExpiresAt!: Date | null;

  /**
   * Reclaimed multipart uploads may finish after their first cleanup.
   * Persist a bounded recheck horizon so a worker crash cannot erase it.
   */
  @Prop({ type: Date, default: null })
  verificationUntil!: Date | null;

  createdAt!: Date;
  updatedAt!: Date;
}

export const AccountExportOrphanCleanupSchema = SchemaFactory.createForClass(
  AccountExportOrphanCleanup,
);

// Multiple workers may report the same failed deletion. Only one durable
// record may exist for the exact job/attempt generation.
AccountExportOrphanCleanupSchema.index(
  { jobId: 1, generation: 1 },
  { unique: true },
);
AccountExportOrphanCleanupSchema.index({
  state: 1,
  nextAttemptAt: 1,
  leaseExpiresAt: 1,
  createdAt: 1,
});
