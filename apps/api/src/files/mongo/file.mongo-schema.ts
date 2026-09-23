import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';

import {
  FILE_ASSET_STATES,
  RESOURCE_FILE_MIME_TYPES,
  type FileAssetState,
  type ResourceFileMimeType,
} from '../domain/file.types';

@Schema({ collection: 'file_assets', timestamps: true })
export class FileAsset {
  @Prop({ required: true, unique: true, index: true })
  id!: string;

  @Prop({ required: true, index: true })
  creatorUserId!: string;

  @Prop({ required: true, enum: ['resource-asset'] })
  purpose!: 'resource-asset';

  @Prop({ required: true })
  provider!: string;

  @Prop({ required: true, unique: true })
  objectKey!: string;

  @Prop({ required: true })
  originalFilename!: string;

  @Prop({ required: true, enum: RESOURCE_FILE_MIME_TYPES })
  declaredMimeType!: ResourceFileMimeType;

  @Prop({ enum: RESOURCE_FILE_MIME_TYPES })
  verifiedMimeType?: ResourceFileMimeType;

  @Prop({ required: true, min: 1 })
  expectedByteSize!: number;

  @Prop({ min: 0 })
  actualByteSize?: number;

  @Prop()
  etag?: string;

  @Prop({ required: true, enum: FILE_ASSET_STATES, index: true })
  state!: FileAssetState;

  @Prop()
  failureCode?: string;

  @Prop({ type: Date, index: true })
  expiresAt?: Date;

  @Prop({ type: Date })
  readyAt?: Date;

  @Prop({ type: String, default: null })
  claimRef?: string | null;

  @Prop({ type: Date })
  claimedAt?: Date;

  @Prop({ type: Date })
  reclaimedAt?: Date;

  createdAt!: Date;
  updatedAt!: Date;
}

export const FileAssetSchema = SchemaFactory.createForClass(FileAsset);

FileAssetSchema.index({ state: 1, expiresAt: 1 });
FileAssetSchema.index(
  { claimRef: 1 },
  {
    unique: true,
    partialFilterExpression: { claimRef: { $type: 'string' } },
  },
);
