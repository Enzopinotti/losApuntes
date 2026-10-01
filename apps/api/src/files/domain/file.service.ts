import {
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
  Optional,
  ServiceUnavailableException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash, randomUUID } from 'node:crypto';
import { basename } from 'node:path';

import type { CreateFileUploadIntentDto } from '../dto/file.dto';
import {
  FAIL_CLOSED_FILE_SAFETY_SCANNER,
  FILE_SAFETY_SCANNER,
  TEST_CLEAN_FILE_SAFETY_SCANNER,
  type FileSafetyScanner,
} from '../safety/file-safety-scanner';
import {
  normalizeResourceMimeType,
  verifyResourceMimeType,
} from '../storage/file-mime';
import { OBJECT_STORAGE, type ObjectStorage } from '../storage/object-storage';
import { FILE_ASSET_STORE, type FileAssetStore } from './file.store';
import type { FileAssetRecord, PublicFileAsset } from './file.types';

const UPLOAD_URL_TTL_SECONDS = 10 * 60;
const PENDING_RECLAIM_MS = 30 * 60 * 1000;
const QUARANTINE_RECLAIM_MS = 24 * 60 * 60 * 1000;
const READY_UNCLAIMED_RECLAIM_MS = 60 * 60 * 1000;
const FAILED_RECLAIM_MS = 5 * 60 * 1000;
const SCAN_LEASE_MS = 5 * 60 * 1000;
const SCAN_RETRY_BASE_MS = 5 * 1000;
const SCAN_RETRY_MAX_MS = 5 * 60 * 1000;
const MAX_SCAN_ATTEMPTS = 5;
const MIME_PREFIX_BYTES = 64;

type ScanOutcome =
  | { kind: 'ready'; asset: FileAssetRecord }
  | { kind: 'rejected' }
  | { kind: 'retry' }
  | { kind: 'failed' }
  | { kind: 'busy' };

function cleanFilename(value: string): string {
  const safeBasename = basename(value.replace(/\\/gu, '/'));
  const cleaned = [...safeBasename.normalize('NFC')]
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

function uploadOperationFingerprint(input: {
  filename: string;
  mimeType: string;
  byteSize: number;
}): string {
  return createHash('sha256')
    .update(JSON.stringify([input.filename, input.mimeType, input.byteSize]))
    .digest('hex');
}

function hasCleanScan(asset: FileAssetRecord): boolean {
  return Boolean(asset.scanCompletedAt && asset.scanEngine);
}

function publicAsset(asset: FileAssetRecord): PublicFileAsset {
  if (
    asset.state !== 'ready' ||
    !asset.verifiedMimeType ||
    asset.actualByteSize === undefined ||
    !asset.readyAt ||
    !hasCleanScan(asset)
  ) {
    throw new Error('Ready file asset is incomplete or unscanned');
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

function retryDelayMs(attempts: number): number {
  const exponent = Math.max(0, Math.min(attempts - 1, 8));
  return Math.min(SCAN_RETRY_BASE_MS * 2 ** exponent, SCAN_RETRY_MAX_MS);
}

function directConstructionScanner(): FileSafetyScanner {
  return process.env.NODE_ENV === 'test'
    ? TEST_CLEAN_FILE_SAFETY_SCANNER
    : FAIL_CLOSED_FILE_SAFETY_SCANNER;
}

@Injectable()
export class FileService {
  private readonly scanner: FileSafetyScanner;

  constructor(
    @Inject(FILE_ASSET_STORE)
    private readonly store: FileAssetStore,
    @Inject(OBJECT_STORAGE)
    private readonly storage: ObjectStorage,
    private readonly config: ConfigService = new ConfigService(),
    @Optional()
    @Inject(FILE_SAFETY_SCANNER)
    scanner?: FileSafetyScanner,
  ) {
    this.scanner = scanner ?? directConstructionScanner();
  }

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

    const filename = cleanFilename(dto.filename);
    const fingerprint = uploadOperationFingerprint({
      filename,
      mimeType,
      byteSize: dto.byteSize,
    });
    const proposedId = randomUUID();
    const asset = await this.store.createOrReplayUpload({
      id: proposedId,
      creatorUserId: userId,
      purpose: 'resource-asset',
      provider: this.storage.providerId,
      objectKey: `resource-assets/${proposedId}/${randomUUID()}`,
      originalFilename: filename,
      declaredMimeType: mimeType,
      expectedByteSize: dto.byteSize,
      uploadOperationKey: dto.operationKey,
      uploadOperationFingerprint: fingerprint,
      state: 'pending',
      scanAttempts: 0,
      expiresAt: new Date(now.getTime() + PENDING_RECLAIM_MS),
    });
    const created = asset.id === proposedId;

    if (asset.uploadOperationFingerprint !== fingerprint) {
      throw new ConflictException({
        code: 'FILE_UPLOAD_IDEMPOTENCY_CONFLICT',
        message: 'Upload operation key was already used for another file',
      });
    }

    if (asset.state !== 'pending') {
      throw new ConflictException({
        code: 'FILE_UPLOAD_OPERATION_STATE_CONFLICT',
        message: 'Upload operation can no longer issue upload credentials',
      });
    }

    if (asset.expiresAt && asset.expiresAt <= now) {
      await this.failAndDelete(asset, 'UPLOAD_EXPIRED', now);
      throw new ConflictException({
        code: 'FILE_UPLOAD_EXPIRED',
        message: 'File upload intent expired',
      });
    }

    try {
      const upload = await this.storage.createUploadIntent({
        objectKey: asset.objectKey,
        contentType: asset.declaredMimeType,
        contentLength: asset.expectedByteSize,
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
      if (created) {
        await this.store.markFailed(
          asset.id,
          userId,
          'STORAGE_UNAVAILABLE',
          new Date(now.getTime() + FAILED_RECLAIM_MS),
        );
      }

      throw new ServiceUnavailableException({
        code: 'FILE_STORAGE_UNAVAILABLE',
        message: 'File storage is temporarily unavailable',
      });
    }
  }

  async finalize(userId: string, id: string, now = new Date()) {
    const existing = await this.store.findOwned(id, userId);
    if (!existing) this.notFound();

    if (existing.state === 'ready' && hasCleanScan(existing)) {
      return { file: publicAsset(existing) };
    }
    if (
      existing.state === 'ready' ||
      existing.state === 'scan_pending' ||
      existing.state === 'scanning'
    ) {
      return this.finalizeStagedScan(existing, now);
    }
    if (existing.state === 'rejected') this.scanRejected();

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

    const staged = await this.store.markScanPending(id, userId, {
      verifiedMimeType,
      actualByteSize: head.byteSize,
      ...(head.etag ? { etag: head.etag } : {}),
      scanNextAttemptAt: now,
      expiresAt: new Date(now.getTime() + QUARANTINE_RECLAIM_MS),
    });

    if (staged) return this.finalizeStagedScan(staged, now);

    const raced = await this.store.findOwned(id, userId);
    if (!raced) this.notFound();
    if (raced.state === 'ready' && hasCleanScan(raced)) {
      return { file: publicAsset(raced) };
    }
    if (raced.state === 'rejected') this.scanRejected();
    if (
      raced.state === 'ready' ||
      raced.state === 'scan_pending' ||
      raced.state === 'scanning'
    ) {
      return this.finalizeStagedScan(raced, now);
    }

    throw new ConflictException({
      code: 'FILE_UPLOAD_STATE_CONFLICT',
      message: 'File upload changed concurrently',
    });
  }

  async getReadyAssetForResource(id: string): Promise<FileAssetRecord | null> {
    const asset = await this.store.findById(id);
    return asset?.state === 'ready' && hasCleanScan(asset) ? asset : null;
  }

  async createAuthorizedDownloadIntent(input: {
    asset: FileAssetRecord;
    filename: string;
    disposition: 'inline' | 'attachment';
  }) {
    if (
      input.asset.state !== 'ready' ||
      !input.asset.verifiedMimeType ||
      input.asset.actualByteSize === undefined ||
      !hasCleanScan(input.asset)
    ) {
      this.notFound();
    }

    try {
      const download = await this.storage.createDownloadIntent({
        objectKey: input.asset.objectKey,
        filename: input.filename,
        contentType: input.asset.verifiedMimeType,
        disposition: input.disposition,
        expiresInSeconds:
          this.config.get<number>('FILES_DOWNLOAD_URL_TTL_SECONDS') ?? 300,
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

  async processPendingScans(
    limit = 20,
    now = new Date(),
  ): Promise<{
    examined: number;
    clean: number;
    rejected: number;
    retryScheduled: number;
    failed: number;
    busy: number;
  }> {
    const rows = await this.store.listScannable(now, limit);
    const result = {
      examined: rows.length,
      clean: 0,
      rejected: 0,
      retryScheduled: 0,
      failed: 0,
      busy: 0,
    };

    for (const row of rows) {
      try {
        const outcome = await this.scanPendingAsset(row, now);
        if (outcome.kind === 'ready') result.clean += 1;
        else if (outcome.kind === 'rejected') result.rejected += 1;
        else if (outcome.kind === 'retry') result.retryScheduled += 1;
        else if (outcome.kind === 'failed') result.failed += 1;
        else result.busy += 1;
      } catch {
        result.failed += 1;
      }
    }

    return result;
  }

  async cleanupExpiredAssets(
    limit = 50,
    now = new Date(),
  ): Promise<{ examined: number; reclaimed: number }> {
    const rows = await this.store.listReclaimable(now, limit);
    let reclaimed = 0;

    for (const row of rows) {
      if (row.state === 'reclaimed') continue;

      try {
        const claimed = await this.store.claimForReclamation(
          row.id,
          row.state,
          now,
        );
        if (!claimed) continue;

        await this.storage.deleteObject(claimed.objectKey);
        if (await this.store.markReclaimed(claimed.id, now)) {
          reclaimed += 1;
        }
      } catch {
        // Durable reclaiming state lets the worker retry storage cleanup.
      }
    }

    return { examined: rows.length, reclaimed };
  }

  private async finalizeStagedScan(asset: FileAssetRecord, now: Date) {
    const outcome = await this.scanPendingAsset(asset, now);

    if (outcome.kind === 'ready') {
      return { file: publicAsset(outcome.asset) };
    }
    if (outcome.kind === 'rejected') this.scanRejected();

    throw new ServiceUnavailableException({
      code:
        outcome.kind === 'failed'
          ? 'FILE_SCAN_UNAVAILABLE'
          : 'FILE_SCAN_PENDING',
      message: 'File safety verification is temporarily unavailable',
    });
  }

  private async scanPendingAsset(
    asset: FileAssetRecord,
    now: Date,
  ): Promise<ScanOutcome> {
    const claimId = randomUUID();
    const claimed = await this.store.claimForScan(
      asset.id,
      claimId,
      now,
      new Date(now.getTime() + SCAN_LEASE_MS),
    );

    if (!claimed) return this.scanRaceOutcome(asset.id);

    if (!claimed.verifiedMimeType || claimed.actualByteSize === undefined) {
      await this.store.markScanFailed(
        claimed.id,
        claimId,
        'SCAN_METADATA_INVALID',
        new Date(now.getTime() + FAILED_RECLAIM_MS),
      );
      return { kind: 'failed' };
    }

    try {
      const scan = await this.scanner.scan({
        chunks: this.storage.readObjectChunks(claimed.objectKey),
        byteSize: claimed.actualByteSize,
        mimeType: claimed.verifiedMimeType,
      });

      if (scan.verdict === 'malicious') {
        const rejected = await this.store.markRejectedFromScan(
          claimed.id,
          claimId,
          {
            scanEngine: scan.engine,
            scanCompletedAt: now,
            expiresAt: new Date(now.getTime() + FAILED_RECLAIM_MS),
          },
        );
        if (!rejected) return this.scanRaceOutcome(claimed.id);
        await this.deleteRejectedBytes(rejected);
        return { kind: 'rejected' };
      }

      const ready = await this.store.markReadyFromScan(claimed.id, claimId, {
        scanEngine: scan.engine,
        scanCompletedAt: now,
        readyAt: now,
        ...(claimed.claimRef
          ? {}
          : {
              expiresAt: new Date(now.getTime() + READY_UNCLAIMED_RECLAIM_MS),
            }),
      });

      if (ready) return { kind: 'ready', asset: ready };
      return this.scanRaceOutcome(claimed.id);
    } catch {
      const attempts = claimed.scanAttempts ?? 1;

      if (attempts >= MAX_SCAN_ATTEMPTS) {
        const failed = await this.store.markScanFailed(
          claimed.id,
          claimId,
          'SCAN_RETRY_EXHAUSTED',
          new Date(now.getTime() + FAILED_RECLAIM_MS),
        );
        return failed ? { kind: 'failed' } : this.scanRaceOutcome(claimed.id);
      }

      const rescheduled = await this.store.rescheduleScan(claimed.id, claimId, {
        failureCode: 'SCANNER_UNAVAILABLE',
        scanNextAttemptAt: new Date(now.getTime() + retryDelayMs(attempts)),
      });
      return rescheduled ? { kind: 'retry' } : this.scanRaceOutcome(claimed.id);
    }
  }

  private async scanRaceOutcome(id: string): Promise<ScanOutcome> {
    const current = await this.store.findById(id);
    if (current?.state === 'ready' && hasCleanScan(current)) {
      return { kind: 'ready', asset: current };
    }
    if (current?.state === 'rejected') return { kind: 'rejected' };
    if (current?.state === 'failed' || current?.state === 'reclaimed') {
      return { kind: 'failed' };
    }
    return { kind: 'busy' };
  }

  private async deleteRejectedBytes(asset: FileAssetRecord): Promise<void> {
    try {
      await this.storage.deleteObject(asset.objectKey);
    } catch {
      // Rejected state remains authoritative if byte cleanup must retry.
    }
  }

  private async failAndDelete(
    asset: FileAssetRecord,
    failureCode: string,
    now: Date,
  ): Promise<void> {
    const failed = await this.store.markFailed(
      asset.id,
      asset.creatorUserId,
      failureCode,
      new Date(now.getTime() + FAILED_RECLAIM_MS),
    );

    if (!failed) return;

    try {
      await this.storage.deleteObject(failed.objectKey);
    } catch {
      // The worker retries storage cleanup from durable failed state.
    }
  }

  private scanRejected(): never {
    throw new UnprocessableEntityException({
      code: 'FILE_SCAN_REJECTED',
      message: 'File failed safety verification',
    });
  }

  private notFound(): never {
    throw new NotFoundException({
      code: 'FILE_UPLOAD_NOT_FOUND',
      message: 'File upload was not found',
    });
  }
}
