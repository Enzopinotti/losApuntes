import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import type { FilterQuery, Model } from 'mongoose';

import {
  type CreateUploadFileAssetRecord,
  type FileAssetStore,
} from '../domain/file.store';
import {
  FILE_ASSET_ACCOUNT_EXPORT_MAX_LIMIT,
  type FileAssetAccountExportRecord,
  type FileAssetRecord,
  type FileAssetState,
} from '../domain/file.types';
import { FileAsset } from './file.mongo-schema';

function mongoErrorCode(error: unknown): number | null {
  if (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    typeof (error as { code?: unknown }).code === 'number'
  ) {
    return (error as { code: number }).code;
  }
  return null;
}

function scanEligibility(now: Date): FilterQuery<FileAsset> {
  return {
    $and: [
      {
        $or: [{ claimRef: { $type: 'string' } }, { expiresAt: { $gt: now } }],
      },
      {
        $or: [
          {
            state: 'scan_pending',
            $or: [
              { scanNextAttemptAt: { $exists: false } },
              { scanNextAttemptAt: { $lte: now } },
            ],
          },
          {
            state: 'scanning',
            scanLeaseExpiresAt: { $lte: now },
          },
          {
            state: 'ready',
            scanCompletedAt: { $exists: false },
          },
        ],
      },
    ],
  };
}

@Injectable()
export class MongoFileAssetStore implements FileAssetStore {
  constructor(
    @InjectModel(FileAsset.name)
    private readonly assets: Model<FileAsset>,
  ) {}

  async listForAccountExport(input: {
    creatorUserId: string;
    limit: number;
    after?: { id: string };
  }): Promise<{ items: FileAssetAccountExportRecord[]; hasMore: boolean }> {
    const requestedLimit = Number.isFinite(input.limit)
      ? Math.trunc(input.limit)
      : 1;
    const limit = Math.min(
      Math.max(1, requestedLimit),
      FILE_ASSET_ACCOUNT_EXPORT_MAX_LIMIT,
    );
    const filter: FilterQuery<FileAsset> = {
      creatorUserId: input.creatorUserId,
      ...(input.after ? { id: { $gt: input.after.id } } : {}),
    };
    const rows = await this.assets
      .find(filter)
      .select({
        _id: 0,
        id: 1,
        originalFilename: 1,
        declaredMimeType: 1,
        verifiedMimeType: 1,
        expectedByteSize: 1,
        actualByteSize: 1,
        createdAt: 1,
      })
      .sort({ id: 1 })
      .limit(limit + 1)
      .lean<FileAssetAccountExportRecord[]>()
      .exec();

    return {
      items: rows.slice(0, limit),
      hasMore: rows.length > limit,
    };
  }

  async createOrReplayUpload(
    input: CreateUploadFileAssetRecord,
  ): Promise<FileAssetRecord> {
    const identity = {
      creatorUserId: input.creatorUserId,
      purpose: input.purpose,
      uploadOperationKey: input.uploadOperationKey,
    };

    try {
      const record = await this.assets
        .findOneAndUpdate(
          identity,
          { $setOnInsert: input },
          { new: true, upsert: true },
        )
        .lean<FileAssetRecord>()
        .exec();

      if (!record) {
        throw new Error('Upload idempotency upsert returned no record');
      }

      return record;
    } catch (error) {
      if (mongoErrorCode(error) !== 11000) throw error;
      const replay = await this.assets
        .findOne(identity)
        .lean<FileAssetRecord>()
        .exec();
      if (!replay) throw error;
      return replay;
    }
  }

  async findById(id: string): Promise<FileAssetRecord | null> {
    return this.assets.findOne({ id }).lean<FileAssetRecord>().exec();
  }

  async findOwned(
    id: string,
    creatorUserId: string,
  ): Promise<FileAssetRecord | null> {
    return this.assets
      .findOne({ id, creatorUserId })
      .lean<FileAssetRecord>()
      .exec();
  }

  async markScanPending(
    id: string,
    creatorUserId: string,
    input: Parameters<FileAssetStore['markScanPending']>[2],
  ): Promise<FileAssetRecord | null> {
    return this.assets
      .findOneAndUpdate(
        { id, creatorUserId, state: 'pending', claimRef: null },
        {
          $set: {
            state: 'scan_pending',
            verifiedMimeType: input.verifiedMimeType,
            actualByteSize: input.actualByteSize,
            ...(input.etag ? { etag: input.etag } : {}),
            scanAttempts: 0,
            scanNextAttemptAt: input.scanNextAttemptAt,
            expiresAt: input.expiresAt,
          },
          $unset: {
            failureCode: 1,
            scanClaimId: 1,
            scanLeaseExpiresAt: 1,
            scanStartedAt: 1,
            scanCompletedAt: 1,
            scanEngine: 1,
            readyAt: 1,
          },
        },
        { new: true },
      )
      .lean<FileAssetRecord>()
      .exec();
  }

  async listScannable(now: Date, limit: number): Promise<FileAssetRecord[]> {
    return this.assets
      .find(scanEligibility(now))
      .sort({ scanNextAttemptAt: 1, updatedAt: 1, id: 1 })
      .limit(limit)
      .lean<FileAssetRecord[]>()
      .exec();
  }

  async claimForScan(
    id: string,
    claimId: string,
    now: Date,
    leaseExpiresAt: Date,
  ): Promise<FileAssetRecord | null> {
    return this.assets
      .findOneAndUpdate(
        { id, ...scanEligibility(now) },
        {
          $set: {
            state: 'scanning',
            scanClaimId: claimId,
            scanStartedAt: now,
            scanLeaseExpiresAt: leaseExpiresAt,
          },
          $inc: { scanAttempts: 1 },
          $unset: { scanNextAttemptAt: 1, failureCode: 1 },
        },
        { new: true },
      )
      .lean<FileAssetRecord>()
      .exec();
  }

  async markReadyFromScan(
    id: string,
    claimId: string,
    input: Parameters<FileAssetStore['markReadyFromScan']>[2],
  ): Promise<FileAssetRecord | null> {
    return this.assets
      .findOneAndUpdate(
        { id, state: 'scanning', scanClaimId: claimId },
        {
          $set: {
            state: 'ready',
            scanEngine: input.scanEngine,
            scanCompletedAt: input.scanCompletedAt,
            readyAt: input.readyAt,
            ...(input.expiresAt ? { expiresAt: input.expiresAt } : {}),
          },
          $unset: {
            failureCode: 1,
            scanNextAttemptAt: 1,
            scanClaimId: 1,
            scanLeaseExpiresAt: 1,
            ...(input.expiresAt ? {} : { expiresAt: 1 }),
          },
        },
        { new: true },
      )
      .lean<FileAssetRecord>()
      .exec();
  }

  async markRejectedFromScan(
    id: string,
    claimId: string,
    input: Parameters<FileAssetStore['markRejectedFromScan']>[2],
  ): Promise<FileAssetRecord | null> {
    return this.assets
      .findOneAndUpdate(
        { id, state: 'scanning', scanClaimId: claimId },
        {
          $set: {
            state: 'rejected',
            failureCode: 'MALWARE_DETECTED',
            scanEngine: input.scanEngine,
            scanCompletedAt: input.scanCompletedAt,
            expiresAt: input.expiresAt,
          },
          $unset: {
            scanNextAttemptAt: 1,
            scanClaimId: 1,
            scanLeaseExpiresAt: 1,
            readyAt: 1,
          },
        },
        { new: true },
      )
      .lean<FileAssetRecord>()
      .exec();
  }

  async rescheduleScan(
    id: string,
    claimId: string,
    input: Parameters<FileAssetStore['rescheduleScan']>[2],
  ): Promise<boolean> {
    const result = await this.assets
      .updateOne(
        { id, state: 'scanning', scanClaimId: claimId },
        {
          $set: {
            state: 'scan_pending',
            failureCode: input.failureCode,
            scanNextAttemptAt: input.scanNextAttemptAt,
          },
          $unset: {
            scanClaimId: 1,
            scanLeaseExpiresAt: 1,
            readyAt: 1,
          },
        },
      )
      .exec();

    return result.modifiedCount === 1;
  }

  async markScanFailed(
    id: string,
    claimId: string,
    failureCode: string,
    expiresAt: Date,
  ): Promise<boolean> {
    const result = await this.assets
      .updateOne(
        { id, state: 'scanning', scanClaimId: claimId },
        {
          $set: {
            state: 'failed',
            failureCode,
            expiresAt,
          },
          $unset: {
            scanNextAttemptAt: 1,
            scanClaimId: 1,
            scanLeaseExpiresAt: 1,
            readyAt: 1,
          },
        },
      )
      .exec();

    return result.modifiedCount === 1;
  }

  async markFailed(
    id: string,
    creatorUserId: string,
    failureCode: string,
    expiresAt: Date,
  ): Promise<FileAssetRecord | null> {
    return this.assets
      .findOneAndUpdate(
        { id, creatorUserId, state: 'pending' },
        {
          $set: {
            state: 'failed',
            failureCode,
            expiresAt,
          },
        },
        { new: true },
      )
      .lean<FileAssetRecord>()
      .exec();
  }

  async listReclaimable(now: Date, limit: number): Promise<FileAssetRecord[]> {
    return this.assets
      .find({
        expiresAt: { $lte: now },
        claimRef: null,
        $or: [
          {
            state: {
              $in: [
                'pending',
                'scan_pending',
                'ready',
                'rejected',
                'failed',
                'reclaiming',
              ],
            },
          },
          {
            state: 'scanning',
            scanLeaseExpiresAt: { $lte: now },
          },
        ],
      })
      .sort({ expiresAt: 1, id: 1 })
      .limit(limit)
      .lean<FileAssetRecord[]>()
      .exec();
  }

  async claimForReclamation(
    id: string,
    expectedState: Exclude<FileAssetState, 'reclaimed'>,
    now: Date,
  ): Promise<FileAssetRecord | null> {
    return this.assets
      .findOneAndUpdate(
        {
          id,
          state: expectedState,
          claimRef: null,
          expiresAt: { $lte: now },
          ...(expectedState === 'scanning'
            ? { scanLeaseExpiresAt: { $lte: now } }
            : {}),
        },
        {
          $set: { state: 'reclaiming' },
          $unset: {
            scanClaimId: 1,
            scanLeaseExpiresAt: 1,
            scanNextAttemptAt: 1,
          },
        },
        { new: true },
      )
      .lean<FileAssetRecord>()
      .exec();
  }

  async markReclaimed(id: string, reclaimedAt: Date): Promise<boolean> {
    const result = await this.assets
      .updateOne(
        { id, state: 'reclaiming', claimRef: null },
        {
          $set: {
            state: 'reclaimed',
            reclaimedAt,
          },
          $unset: { expiresAt: 1 },
        },
      )
      .exec();

    return result.modifiedCount === 1;
  }
}
