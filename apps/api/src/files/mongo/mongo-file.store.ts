import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import type { Model } from 'mongoose';

import {
  type CreateUploadFileAssetRecord,
  type FileAssetStore,
} from '../domain/file.store';
import type { FileAssetRecord, FileAssetState } from '../domain/file.types';
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

function toPlain<T>(value: { toObject(): unknown } | T): T {
  if (
    typeof value === 'object' &&
    value !== null &&
    'toObject' in value &&
    typeof value.toObject === 'function'
  ) {
    return value.toObject() as T;
  }

  return value as T;
}

@Injectable()
export class MongoFileAssetStore implements FileAssetStore {
  constructor(
    @InjectModel(FileAsset.name)
    private readonly assets: Model<FileAsset>,
  ) {}

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

  async markReady(
    id: string,
    creatorUserId: string,
    input: {
      verifiedMimeType: FileAssetRecord['declaredMimeType'];
      actualByteSize: number;
      etag?: string;
      readyAt: Date;
      expiresAt: Date;
    },
  ): Promise<FileAssetRecord | null> {
    return this.assets
      .findOneAndUpdate(
        { id, creatorUserId, state: 'pending' },
        {
          $set: {
            state: 'ready',
            verifiedMimeType: input.verifiedMimeType,
            actualByteSize: input.actualByteSize,
            ...(input.etag ? { etag: input.etag } : {}),
            readyAt: input.readyAt,
            expiresAt: input.expiresAt,
          },
          $unset: { failureCode: 1 },
        },
        { new: true },
      )
      .lean<FileAssetRecord>()
      .exec();
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
        state: { $in: ['pending', 'failed', 'ready', 'reclaiming'] },
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
        },
        {
          $set: {
            state: 'reclaiming',
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
