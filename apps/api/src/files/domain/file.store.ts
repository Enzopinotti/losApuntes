import type { FileAssetRecord, FileAssetState } from './file.types';

export const FILE_ASSET_STORE = Symbol('FILE_ASSET_STORE');

export type CreateFileAssetRecord = Omit<
  FileAssetRecord,
  'createdAt' | 'updatedAt'
>;

export type CreateUploadFileAssetRecord = CreateFileAssetRecord & {
  uploadOperationKey: string;
  uploadOperationFingerprint: string;
};

export interface FileAssetStore {
  createOrReplayUpload(
    input: CreateUploadFileAssetRecord,
  ): Promise<FileAssetRecord>;
  findOwned(id: string, creatorUserId: string): Promise<FileAssetRecord | null>;
  findById(id: string): Promise<FileAssetRecord | null>;
  markScanPending(
    id: string,
    creatorUserId: string,
    input: {
      verifiedMimeType: FileAssetRecord['declaredMimeType'];
      actualByteSize: number;
      etag?: string;
      scanNextAttemptAt: Date;
      expiresAt: Date;
    },
  ): Promise<FileAssetRecord | null>;
  listScannable(now: Date, limit: number): Promise<FileAssetRecord[]>;
  claimForScan(
    id: string,
    claimId: string,
    now: Date,
    leaseExpiresAt: Date,
  ): Promise<FileAssetRecord | null>;
  markReadyFromScan(
    id: string,
    claimId: string,
    input: {
      scanEngine: string;
      scanCompletedAt: Date;
      readyAt: Date;
      expiresAt?: Date;
    },
  ): Promise<FileAssetRecord | null>;
  markRejectedFromScan(
    id: string,
    claimId: string,
    input: {
      scanEngine: string;
      scanCompletedAt: Date;
      expiresAt: Date;
    },
  ): Promise<FileAssetRecord | null>;
  rescheduleScan(
    id: string,
    claimId: string,
    input: {
      failureCode: string;
      scanNextAttemptAt: Date;
    },
  ): Promise<boolean>;
  markScanFailed(
    id: string,
    claimId: string,
    failureCode: string,
    expiresAt: Date,
  ): Promise<boolean>;
  markFailed(
    id: string,
    creatorUserId: string,
    failureCode: string,
    expiresAt: Date,
  ): Promise<FileAssetRecord | null>;
  listReclaimable(now: Date, limit: number): Promise<FileAssetRecord[]>;
  claimForReclamation(
    id: string,
    expectedState: Exclude<FileAssetState, 'reclaimed'>,
    now: Date,
  ): Promise<FileAssetRecord | null>;
  markReclaimed(id: string, reclaimedAt: Date): Promise<boolean>;
}
