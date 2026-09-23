import {
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import path from 'node:path';

import type { CreateFileUploadIntentDto } from '../dto/file.dto';
import {
  normalizeResourceMimeType,
  verifyResourceMimeType,
} from '../storage/file-mime';
import { OBJECT_STORAGE, type ObjectStorage } from '../storage/object-storage';
import { FILE_ASSET_STORE, type FileAssetStore } from './file.store';
import type { FileAssetRecord, PublicFileAsset } from './file.types';

const UPLOAD_URL_TTL_SECONDS = 10 * 60;
const PENDING_RECLAIM_MS = 30 * 60 * 1000;
const READY_UNCLAIMED_RECLAIM_MS = 60 * 60 * 1000;
const FAILED_RECLAIM_MS = 5 * 60 * 1000;
const MIME_PREFIX_BYTES = 64;

function cleanFilename(value: string): string {
  const basename = path.basename(value.replace(/\\/gu, '/'));
  const cleaned = [...basename.normalize('NFC')]
    .filter((character) => {
      const code = character.codePointAt(0) ?? 0;
      return code >= 0x20 && code !== 0x7f;
    })
    .join('')
    .trim();

  if (!cleaned) {
    throw new UnprocessableEntityException({
      code: 'FILE_NAME_INVALID',
      message: 'Filename is invalid',
    });
  }

  return cleaned.slice(0, 180);
}

function publicAsset(asset: FileAssetRecord): PublicFileAsset {
  if (
    asset.state !== 'ready' ||
    !asset.verifiedMimeType ||
    asset.actualByteSize === undefined ||
    !asset.readyAt
  ) {
    throw new Error('Ready file asset is incomplete');
  }

  return {
    id: asset.id,
    filename: asset.originalFilename,
    mimeType: asset.verifiedMimeType,
    byteSize: asset.actualByteSize,
    state: 'ready',
    readyAt: asset.readyAt.toISOString(),
  };
}

@Injectable()
export class FileService {
  constructor(
    @Inject(FILE_ASSET_STORE)
    private readonly store: FileAssetStore,
    @Inject(OBJECT_STORAGE)
    private readonly storage: ObjectStorage,
  ) {}

  async createUploadIntent(
    userId: string,
    dto: CreateFileUploadIntentDto,
    now = new Date(),
  ) {
    const mimeType = normalizeResourceMimeType(dto.mimeType);
    if (!mimeType) {
      throw new UnprocessableEntityException({
        code: 'FILE_TYPE_UNSUPPORTED',
        message: 'File type is not supported for Resources v1',
      });
    }

    const id = randomUUID();
    const asset = await this.store.create({
      id,
      creatorUserId: userId,
      purpose: 'resource-asset',
      provider: this.storage.providerId,
      objectKey: `resource-assets/${id}/${randomUUID()}`,
      originalFilename: cleanFilename(dto.filename),
      declaredMimeType: mimeType,
      expectedByteSize: dto.byteSize,
      state: 'pending',
      expiresAt: new Date(now.getTime() + PENDING_RECLAIM_MS),
    });

    try {
      const upload = await this.storage.createUploadIntent({
        objectKey: asset.objectKey,
        contentType: mimeType,
        expiresInSeconds: UPLOAD_URL_TTL_SECONDS,
      });

      return {
        file: {
          id: asset.id,
          filename: asset.originalFilename,
          mimeType: asset.declaredMimeType,
          expectedByteSize: asset.expectedByteSize,
          state: asset.state,
        },
        upload: {
          url: upload.url,
          method: upload.method,
          headers: upload.headers,
          expiresAt: upload.expiresAt.toISOString(),
        },
      };
    } catch {
      await this.store.markFailed(
        asset.id,
        userId,
        'STORAGE_UNAVAILABLE',
        new Date(now.getTime() + FAILED_RECLAIM_MS),
      );

      throw new ServiceUnavailableException({
        code: 'FILE_STORAGE_UNAVAILABLE',
        message: 'File storage is temporarily unavailable',
      });
    }
  }

  async finalize(userId: string, id: string, now = new Date()) {
    const existing = await this.store.findOwned(id, userId);
    if (!existing) this.notFound();

    if (existing.state === 'ready') {
      return { file: publicAsset(existing) };
    }

    if (existing.state !== 'pending') {
      throw new ConflictException({
        code: 'FILE_UPLOAD_STATE_CONFLICT',
        message: 'File upload can no longer be finalized',
      });
    }

    if (existing.expiresAt && existing.expiresAt <= now) {
      await this.failAndDelete(existing, 'UPLOAD_EXPIRED', now);
      throw new ConflictException({
        code: 'FILE_UPLOAD_EXPIRED',
        message: 'File upload intent expired',
      });
    }

    let head;
    let prefix: Uint8Array;

    try {
      head = await this.storage.headObject(existing.objectKey);
      if (!head) {
        throw new ConflictException({
          code: 'FILE_UPLOAD_INCOMPLETE',
          message: 'Uploaded object is not available yet',
        });
      }

      if (head.byteSize !== existing.expectedByteSize) {
        await this.failAndDelete(existing, 'SIZE_MISMATCH', now);
        throw new UnprocessableEntityException({
          code: 'FILE_UPLOAD_INVALID',
          message: 'Uploaded file size does not match the upload intent',
        });
      }

      const storedMime = head.contentType
        ? normalizeResourceMimeType(head.contentType)
        : null;
      if (storedMime !== existing.declaredMimeType) {
        await this.failAndDelete(existing, 'CONTENT_TYPE_MISMATCH', now);
        throw new UnprocessableEntityException({
          code: 'FILE_UPLOAD_INVALID',
          message:
            'Uploaded file content type does not match the upload intent',
        });
      }

      prefix = await this.storage.readPrefix(
        existing.objectKey,
        MIME_PREFIX_BYTES,
      );
    } catch (error) {
      if (
        error instanceof ConflictException ||
        error instanceof UnprocessableEntityException
      ) {
        throw error;
      }

      throw new ServiceUnavailableException({
        code: 'FILE_STORAGE_UNAVAILABLE',
        message: 'File storage is temporarily unavailable',
      });
    }

    const verifiedMimeType = verifyResourceMimeType(
      prefix,
      existing.declaredMimeType,
    );

    if (!verifiedMimeType) {
      await this.failAndDelete(existing, 'CONTENT_SIGNATURE_MISMATCH', now);
      throw new UnprocessableEntityException({
        code: 'FILE_UPLOAD_INVALID',
        message: 'Uploaded bytes do not match the declared file type',
      });
    }

    const ready = await this.store.markReady(id, userId, {
      verifiedMimeType,
      actualByteSize: head.byteSize,
      ...(head.etag ? { etag: head.etag } : {}),
      readyAt: now,
      expiresAt: new Date(now.getTime() + READY_UNCLAIMED_RECLAIM_MS),
    });

    if (ready) return { file: publicAsset(ready) };

    const raced = await this.store.findOwned(id, userId);
    if (raced?.state === 'ready') return { file: publicAsset(raced) };

    throw new ConflictException({
      code: 'FILE_UPLOAD_STATE_CONFLICT',
      message: 'File upload changed concurrently',
    });
  }

  async getReadyAssetForResource(id: string): Promise<FileAssetRecord | null> {
    const asset = await this.store.findById(id);
    return asset?.state === 'ready' ? asset : null;
  }

  async createAuthorizedDownloadIntent(input: {
    asset: FileAssetRecord;
    filename: string;
    disposition: 'inline' | 'attachment';
  }) {
    if (
      input.asset.state !== 'ready' ||
      !input.asset.verifiedMimeType ||
      input.asset.actualByteSize === undefined
    ) {
      this.notFound();
    }

    try {
      const download = await this.storage.createDownloadIntent({
        objectKey: input.asset.objectKey,
        filename: input.filename,
        contentType: input.asset.verifiedMimeType,
        disposition: input.disposition,
        expiresInSeconds: 5 * 60,
      });

      return {
        url: download.url,
        expiresAt: download.expiresAt.toISOString(),
      };
    } catch {
      throw new ServiceUnavailableException({
        code: 'FILE_STORAGE_UNAVAILABLE',
        message: 'File storage is temporarily unavailable',
      });
    }
  }

  async cleanupExpiredAssets(
    limit = 50,
    now = new Date(),
  ): Promise<{ examined: number; reclaimed: number }> {
    const rows = await this.store.listReclaimable(now, limit);
    let reclaimed = 0;

    for (const row of rows) {
      try {
        await this.storage.deleteObject(row.objectKey);
        if (await this.store.markReclaimed(row.id, row.state, now)) {
          reclaimed += 1;
        }
      } catch {
        // Leave the row reclaimable so the dedicated worker can retry later.
      }
    }

    return { examined: rows.length, reclaimed };
  }

  private async failAndDelete(
    asset: FileAssetRecord,
    failureCode: string,
    now: Date,
  ): Promise<void> {
    await this.store.markFailed(
      asset.id,
      asset.creatorUserId,
      failureCode,
      new Date(now.getTime() + FAILED_RECLAIM_MS),
    );

    try {
      await this.storage.deleteObject(asset.objectKey);
    } catch {
      // The worker retries storage cleanup from durable failed state.
    }
  }

  private notFound(): never {
    throw new NotFoundException({
      code: 'FILE_UPLOAD_NOT_FOUND',
      message: 'File upload was not found',
    });
  }
}
