import type { FileAssetRecord, FileAssetState } from './file.types';

export const FILE_ASSET_STORE = Symbol('FILE_ASSET_STORE');

export type CreateFileAssetRecord = Omit<
  FileAssetRecord,
  'createdAt' | 'updatedAt'
>;

export interface FileAssetStore {
  create(input: CreateFileAssetRecord): Promise<FileAssetRecord>;
  findOwned(id: string, creatorUserId: string): Promise<FileAssetRecord | null>;
  findById(id: string): Promise<FileAssetRecord | null>;
  markReady(
    id: string,
    creatorUserId: string,
    input: {
      verifiedMimeType: FileAssetRecord['declaredMimeType'];
      actualByteSize: number;
      etag?: string;
      readyAt: Date;
      expiresAt: Date;
    },
  ): Promise<FileAssetRecord | null>;
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
