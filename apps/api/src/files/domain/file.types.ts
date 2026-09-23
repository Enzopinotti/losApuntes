export const FILE_ASSET_STATES = [
  'pending',
  'ready',
  'failed',
  'reclaiming',
  'reclaimed',
] as const;

export type FileAssetState = (typeof FILE_ASSET_STATES)[number];

export const RESOURCE_FILE_MIME_TYPES = [
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/webp',
] as const;

export type ResourceFileMimeType = (typeof RESOURCE_FILE_MIME_TYPES)[number];

export interface FileAssetRecord {
  id: string;
  creatorUserId: string;
  purpose: 'resource-asset';
  provider: string;
  objectKey: string;
  originalFilename: string;
  declaredMimeType: ResourceFileMimeType;
  verifiedMimeType?: ResourceFileMimeType;
  expectedByteSize: number;
  actualByteSize?: number;
  etag?: string;
  state: FileAssetState;
  failureCode?: string;
  expiresAt?: Date;
  readyAt?: Date;
  claimRef?: string;
  claimedAt?: Date;
  reclaimedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

export interface PublicFileAsset {
  id: string;
  filename: string;
  mimeType: ResourceFileMimeType;
  byteSize: number;
  state: 'ready';
  readyAt: string;
}
