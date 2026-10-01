import {
  ConflictException,
  NotFoundException,
  ServiceUnavailableException,
  UnprocessableEntityException,
} from '@nestjs/common';

import type { FileAssetStore } from './file.store';
import { FileService } from './file.service';
import type { FileAssetRecord } from './file.types';
import type { ObjectStorage } from '../storage/object-storage';

const now = new Date('2026-09-23T12:00:00.000Z');

function asset(overrides: Partial<FileAssetRecord> = {}): FileAssetRecord {
  return {
    id: '11111111-1111-4111-8111-111111111111',
    creatorUserId: 'user-1',
    purpose: 'resource-asset',
    provider: 's3',
    objectKey: 'resource-assets/test/file',
    originalFilename: 'apunte.pdf',
    declaredMimeType: 'application/pdf',
    expectedByteSize: 8,
    state: 'pending',
    expiresAt: new Date(now.getTime() + 60_000),
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

function store(): jest.Mocked<FileAssetStore> {
  return {
    createOrReplayUpload: jest.fn((input) =>
      Promise.resolve({ ...input, createdAt: now, updatedAt: now }),
    ),
    findOwned: jest.fn(),
    findById: jest.fn(),
    markScanPending: jest.fn((id, creatorUserId, input) =>
      Promise.resolve(
        asset({
          id,
          creatorUserId,
          state: 'scan_pending',
          verifiedMimeType: input.verifiedMimeType,
          actualByteSize: input.actualByteSize,
          ...(input.etag ? { etag: input.etag } : {}),
          scanAttempts: 0,
          scanNextAttemptAt: input.scanNextAttemptAt,
          expiresAt: input.expiresAt,
        }),
      ),
    ),
    listScannable: jest.fn().mockResolvedValue([]),
    claimForScan: jest.fn((id, claimId, claimedAt, leaseExpiresAt) =>
      Promise.resolve(
        asset({
          id,
          state: 'scanning',
          verifiedMimeType: 'application/pdf',
          actualByteSize: 8,
          scanAttempts: 1,
          scanClaimId: claimId,
          scanStartedAt: claimedAt,
          scanLeaseExpiresAt: leaseExpiresAt,
          expiresAt: new Date(now.getTime() + 60_000),
        }),
      ),
    ),
    markReadyFromScan: jest.fn((id, _claimId, input) =>
      Promise.resolve(
        asset({
          id,
          state: 'ready',
          verifiedMimeType: 'application/pdf',
          actualByteSize: 8,
          readyAt: input.readyAt,
          expiresAt: input.expiresAt,
          scanEngine: input.scanEngine,
          scanCompletedAt: input.scanCompletedAt,
        }),
      ),
    ),
    markRejectedFromScan: jest.fn((id, _claimId, input) =>
      Promise.resolve(
        asset({
          id,
          state: 'rejected',
          verifiedMimeType: 'application/pdf',
          actualByteSize: 8,
          failureCode: 'MALWARE_DETECTED',
          scanEngine: input.scanEngine,
          scanCompletedAt: input.scanCompletedAt,
          expiresAt: input.expiresAt,
        }),
      ),
    ),
    rescheduleScan: jest.fn().mockResolvedValue(true),
    markScanFailed: jest.fn().mockResolvedValue(true),
    markFailed: jest.fn(),
    listReclaimable: jest.fn(),
    claimForReclamation: jest.fn(),
    markReclaimed: jest.fn(),
  };
}

function storage(): jest.Mocked<ObjectStorage> {
  return {
    providerId: 's3',
    createUploadIntent: jest.fn(),
    headObject: jest.fn(),
    readPrefix: jest.fn(),
    readObjectChunks: jest.fn((_objectKey: string, _maximumChunkBytes?: number) =>
      (async function* () {
        yield new Uint8Array(Buffer.from('%PDF-1.7'));
      })(),
    ),
    createDownloadIntent: jest.fn(),
    deleteObject: jest.fn(),
  };
}

describe('FileService', () => {
  it('creates a private upload intent without exposing object keys', async () => {
    const fileStore = store();
    const objectStorage = storage();
    fileStore.createOrReplayUpload.mockImplementation((input) =>
      Promise.resolve({
        ...input,
        createdAt: now,
        updatedAt: now,
      }),
    );
    objectStorage.createUploadIntent.mockResolvedValue({
      url: 'http://storage.test/signed-put',
      method: 'PUT',
      headers: {
        'content-type': 'application/pdf',
        'if-none-match': '*',
      },
      expiresAt: new Date(now.getTime() + 600_000),
    });

    const result = await new FileService(
      fileStore,
      objectStorage,
    ).createUploadIntent(
      'user-1',
      {
        operationKey: '22222222-2222-4222-8222-222222222222',
        filename: '../Apunte final.pdf',
        mimeType: 'application/pdf',
        byteSize: 8,
      },
      now,
    );

    expect(result.file.filename).toBe('Apunte final.pdf');
    expect(result.upload.headers['if-none-match']).toBe('*');
    expect(objectStorage.createUploadIntent.mock.calls[0]?.[0]).toEqual(
      expect.objectContaining({
        contentLength: 8,
        contentType: 'application/pdf',
      }),
    );
    expect(result).not.toHaveProperty('objectKey');
    expect(JSON.stringify(result)).not.toContain('resource-assets/');
  });

  it('rejects unsupported MIME before persistence', async () => {
    const fileStore = store();
    const objectStorage = storage();

    await expect(
      new FileService(fileStore, objectStorage).createUploadIntent(
        'user-1',
        {
          operationKey: '22222222-2222-4222-8222-222222222222',
          filename: 'virus.exe',
          mimeType: 'application/octet-stream',
          byteSize: 10,
        },
        now,
      ),
    ).rejects.toBeInstanceOf(UnprocessableEntityException);

    expect(fileStore.createOrReplayUpload.mock.calls).toHaveLength(0);
  });

  it('marks intent failed when storage cannot sign upload', async () => {
    const fileStore = store();
    const objectStorage = storage();
    fileStore.createOrReplayUpload.mockImplementation((input) =>
      Promise.resolve({ ...input, createdAt: now, updatedAt: now }),
    );
    objectStorage.createUploadIntent.mockRejectedValue(
      new Error('storage unavailable'),
    );

    await expect(
      new FileService(fileStore, objectStorage).createUploadIntent(
        'user-1',
        {
          operationKey: '22222222-2222-4222-8222-222222222222',
          filename: 'apunte.pdf',
          mimeType: 'application/pdf',
          byteSize: 8,
        },
        now,
      ),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);

    expect(fileStore.markFailed.mock.calls).toContainEqual([
      expect.any(String),
      'user-1',
      'STORAGE_UNAVAILABLE',
      expect.any(Date),
    ]);
  });

  it('replays the same upload operation and rejects semantic key reuse', async () => {
    const fileStore = store();
    const objectStorage = storage();
    let replay: FileAssetRecord | null = null;

    fileStore.createOrReplayUpload.mockImplementation((input) => {
      replay ??= {
        ...input,
        id: '33333333-3333-4333-8333-333333333333',
        objectKey: 'resource-assets/replay/file',
        createdAt: now,
        updatedAt: now,
      };
      return Promise.resolve(replay);
    });
    objectStorage.createUploadIntent.mockResolvedValue({
      url: 'http://storage.test/signed-put',
      method: 'PUT',
      headers: {
        'content-type': 'application/pdf',
        'if-none-match': '*',
      },
      expiresAt: new Date(now.getTime() + 600_000),
    });

    const service = new FileService(fileStore, objectStorage);
    const operationKey = '44444444-4444-4444-8444-444444444444';
    const first = await service.createUploadIntent(
      'user-1',
      {
        operationKey,
        filename: 'apunte.pdf',
        mimeType: 'application/pdf',
        byteSize: 8,
      },
      now,
    );
    const second = await service.createUploadIntent(
      'user-1',
      {
        operationKey,
        filename: 'apunte.pdf',
        mimeType: 'application/pdf',
        byteSize: 8,
      },
      now,
    );

    expect(first.file.id).toBe(second.file.id);
    expect(objectStorage.createUploadIntent.mock.calls).toHaveLength(2);
    expect(
      objectStorage.createUploadIntent.mock.calls.map(
        ([input]) => input.objectKey,
      ),
    ).toEqual(['resource-assets/replay/file', 'resource-assets/replay/file']);

    try {
      await service.createUploadIntent(
        'user-1',
        {
          operationKey,
          filename: 'otro.pdf',
          mimeType: 'application/pdf',
          byteSize: 8,
        },
        now,
      );
      throw new Error('Expected idempotency conflict');
    } catch (error) {
      expect(error).toBeInstanceOf(ConflictException);
      if (!(error instanceof ConflictException)) throw error;
      expect(error.getResponse()).toEqual(
        expect.objectContaining({
          code: 'FILE_UPLOAD_IDEMPOTENCY_CONFLICT',
        }),
      );
    }
  });

  it('finalizes a valid PDF and is idempotent after ready', async () => {
    const fileStore = store();
    const objectStorage = storage();
    const pending = asset();
    const ready = asset({
      state: 'ready',
      verifiedMimeType: 'application/pdf',
      actualByteSize: 8,
      etag: 'etag-1',
      readyAt: now,
      scanEngine: 'test-clean-v1',
      scanCompletedAt: now,
    });

    fileStore.findOwned
      .mockResolvedValueOnce(pending)
      .mockResolvedValueOnce(ready);
    objectStorage.headObject.mockResolvedValue({
      byteSize: 8,
      contentType: 'application/pdf',
      etag: 'etag-1',
    });
    objectStorage.readPrefix.mockResolvedValue(
      new Uint8Array(Buffer.from('%PDF-1.7')),
    );
    fileStore.markReadyFromScan.mockResolvedValue(ready);

    const service = new FileService(fileStore, objectStorage);
    const first = await service.finalize('user-1', pending.id, now);
    const second = await service.finalize('user-1', pending.id, now);

    expect(first.file.state).toBe('ready');
    expect(second.file.id).toBe(pending.id);
    expect(objectStorage.headObject.mock.calls).toHaveLength(1);
  });

  it('fails closed and deletes mismatched-size bytes', async () => {
    const fileStore = store();
    const objectStorage = storage();
    const pending = asset();

    fileStore.findOwned.mockResolvedValue(pending);
    fileStore.markFailed.mockResolvedValue(
      asset({ state: 'failed', failureCode: 'SIZE_MISMATCH' }),
    );
    objectStorage.headObject.mockResolvedValue({
      byteSize: 9,
      contentType: 'application/pdf',
      etag: null,
    });

    await expect(
      new FileService(fileStore, objectStorage).finalize(
        'user-1',
        pending.id,
        now,
      ),
    ).rejects.toBeInstanceOf(UnprocessableEntityException);

    expect(fileStore.markFailed.mock.calls).toContainEqual([
      pending.id,
      'user-1',
      'SIZE_MISMATCH',
      expect.any(Date),
    ]);
    expect(objectStorage.deleteObject.mock.calls).toContainEqual([
      pending.objectKey,
    ]);
  });

  it('fails closed when content signature does not match declared MIME', async () => {
    const fileStore = store();
    const objectStorage = storage();
    const pending = asset();

    fileStore.findOwned.mockResolvedValue(pending);
    objectStorage.headObject.mockResolvedValue({
      byteSize: 8,
      contentType: 'application/pdf',
      etag: null,
    });
    objectStorage.readPrefix.mockResolvedValue(
      new Uint8Array(Buffer.from('NOTPDF!!')),
    );
    fileStore.markFailed.mockResolvedValue(
      asset({
        state: 'failed',
        failureCode: 'CONTENT_SIGNATURE_MISMATCH',
      }),
    );

    await expect(
      new FileService(fileStore, objectStorage).finalize(
        'user-1',
        pending.id,
        now,
      ),
    ).rejects.toBeInstanceOf(UnprocessableEntityException);

    expect(fileStore.markFailed.mock.calls).toContainEqual([
      pending.id,
      'user-1',
      'CONTENT_SIGNATURE_MISMATCH',
      expect.any(Date),
    ]);
  });

  it('rejects expired upload intents and schedules cleanup', async () => {
    const fileStore = store();
    const objectStorage = storage();
    const pending = asset({
      expiresAt: new Date(now.getTime() - 1),
    });
    fileStore.findOwned.mockResolvedValue(pending);

    await expect(
      new FileService(fileStore, objectStorage).finalize(
        'user-1',
        pending.id,
        now,
      ),
    ).rejects.toBeInstanceOf(ConflictException);

    expect(fileStore.markFailed.mock.calls).toContainEqual([
      pending.id,
      'user-1',
      'UPLOAD_EXPIRED',
      expect.any(Date),
    ]);
  });

  it('does not hide storage outages as invalid uploads', async () => {
    const fileStore = store();
    const objectStorage = storage();
    const pending = asset();
    fileStore.findOwned.mockResolvedValue(pending);
    objectStorage.headObject.mockRejectedValue(new Error('network'));

    await expect(
      new FileService(fileStore, objectStorage).finalize(
        'user-1',
        pending.id,
        now,
      ),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);

    expect(fileStore.markFailed.mock.calls).toHaveLength(0);
  });

  it('creates bounded signed downloads only for complete ready assets', async () => {
    const fileStore = store();
    const objectStorage = storage();
    const ready = asset({
      state: 'ready',
      verifiedMimeType: 'application/pdf',
      actualByteSize: 8,
      readyAt: now,
      scanEngine: 'test-clean-v1',
      scanCompletedAt: now,
    });
    objectStorage.createDownloadIntent.mockResolvedValue({
      url: 'http://storage.test/signed-get',
      expiresAt: new Date(now.getTime() + 300_000),
    });

    const result = await new FileService(
      fileStore,
      objectStorage,
    ).createAuthorizedDownloadIntent({
      asset: ready,
      filename: 'apunte.pdf',
      disposition: 'inline',
    });

    expect(result.url).toContain('signed-get');
    expect(objectStorage.createDownloadIntent.mock.calls[0]?.[0]).toEqual(
      expect.objectContaining({
        expiresInSeconds: 300,
        disposition: 'inline',
      }),
    );
  });

  it('rejects filenames that become empty after sanitization', async () => {
    const fileStore = store();
    const objectStorage = storage();

    await expect(
      new FileService(fileStore, objectStorage).createUploadIntent(
        'user-1',
        {
          operationKey: '22222222-2222-4222-8222-222222222222',
          filename: '../\u0000',
          mimeType: 'application/pdf',
          byteSize: 8,
        },
        now,
      ),
    ).rejects.toBeInstanceOf(UnprocessableEntityException);
  });

  it('rejects non-pending finalize states and missing uploaded objects', async () => {
    const fileStore = store();
    const objectStorage = storage();
    const service = new FileService(fileStore, objectStorage);

    fileStore.findOwned.mockResolvedValueOnce(asset({ state: 'failed' }));
    await expect(
      service.finalize('user-1', asset().id, now),
    ).rejects.toBeInstanceOf(ConflictException);

    fileStore.findOwned.mockResolvedValueOnce(asset());
    objectStorage.headObject.mockResolvedValueOnce(null);
    await expect(
      service.finalize('user-1', asset().id, now),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('rejects stored content-type mismatches even when size matches', async () => {
    const fileStore = store();
    const objectStorage = storage();
    const pending = asset();
    fileStore.findOwned.mockResolvedValue(pending);
    objectStorage.headObject.mockResolvedValue({
      byteSize: 8,
      contentType: 'image/png',
      etag: null,
    });
    fileStore.markFailed.mockResolvedValue(
      asset({
        state: 'failed',
        failureCode: 'CONTENT_TYPE_MISMATCH',
      }),
    );

    await expect(
      new FileService(fileStore, objectStorage).finalize(
        'user-1',
        pending.id,
        now,
      ),
    ).rejects.toBeInstanceOf(UnprocessableEntityException);

    expect(fileStore.markFailed.mock.calls).toContainEqual([
      pending.id,
      'user-1',
      'CONTENT_TYPE_MISMATCH',
      expect.any(Date),
    ]);
  });

  it('resolves a mark-ready race only when the concurrent state is ready', async () => {
    const fileStore = store();
    const objectStorage = storage();
    const pending = asset();
    const ready = asset({
      state: 'ready',
      verifiedMimeType: 'application/pdf',
      actualByteSize: 8,
      readyAt: now,
      scanEngine: 'test-clean-v1',
      scanCompletedAt: now,
    });
    fileStore.findOwned
      .mockResolvedValueOnce(pending)
      .mockResolvedValueOnce(ready);
    objectStorage.headObject.mockResolvedValue({
      byteSize: 8,
      contentType: 'application/pdf',
      etag: null,
    });
    objectStorage.readPrefix.mockResolvedValue(
      new Uint8Array(Buffer.from('%PDF-1.7')),
    );
    fileStore.markReadyFromScan.mockResolvedValue(null);
    fileStore.findById.mockResolvedValueOnce(ready);

    const racedReady = await new FileService(fileStore, objectStorage).finalize(
      'user-1',
      pending.id,
      now,
    );
    expect(racedReady.file.id).toBe(pending.id);
    expect(racedReady.file.state).toBe('ready');

    fileStore.findOwned.mockReset().mockResolvedValueOnce(pending);
    fileStore.findById
      .mockReset()
      .mockResolvedValueOnce(asset({ state: 'failed' }));

    await expect(
      new FileService(fileStore, objectStorage).finalize(
        'user-1',
        pending.id,
        now,
      ),
    ).rejects.toMatchObject({
      response: expect.objectContaining({
        code: 'FILE_SCAN_UNAVAILABLE',
      }),
    });
  });

  it('returns ready assets only and fails closed on incomplete download assets', async () => {
    const fileStore = store();
    const objectStorage = storage();
    const service = new FileService(fileStore, objectStorage);

    fileStore.findById.mockResolvedValueOnce(asset({ state: 'pending' }));
    await expect(
      service.getReadyAssetForResource(asset().id),
    ).resolves.toBeNull();

    await expect(
      service.createAuthorizedDownloadIntent({
        asset: asset({ state: 'pending' }),
        filename: 'x.pdf',
        disposition: 'inline',
      }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('maps download signing failures and honors configured TTL', async () => {
    const fileStore = store();
    const objectStorage = storage();
    const ready = asset({
      state: 'ready',
      verifiedMimeType: 'application/pdf',
      actualByteSize: 8,
      readyAt: now,
      scanEngine: 'test-clean-v1',
      scanCompletedAt: now,
    });
    const config = {
      get: jest.fn().mockReturnValue(2),
    };

    objectStorage.createDownloadIntent.mockRejectedValueOnce(
      new Error('signing unavailable'),
    );
    await expect(
      new FileService(
        fileStore,
        objectStorage,
        config as never,
      ).createAuthorizedDownloadIntent({
        asset: ready,
        filename: 'x.pdf',
        disposition: 'attachment',
      }),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);

    objectStorage.createDownloadIntent.mockResolvedValueOnce({
      url: 'http://storage.test/get',
      expiresAt: now,
    });
    await new FileService(
      fileStore,
      objectStorage,
      config as never,
    ).createAuthorizedDownloadIntent({
      asset: ready,
      filename: 'x.pdf',
      disposition: 'attachment',
    });
    expect(objectStorage.createDownloadIntent.mock.calls.at(-1)?.[0]).toEqual(
      expect.objectContaining({ expiresInSeconds: 2 }),
    );
  });

  it('does not delete bytes when another finalize wins the fail transition', async () => {
    const fileStore = store();
    const objectStorage = storage();
    const pending = asset({
      expiresAt: new Date(now.getTime() - 1),
    });

    fileStore.findOwned.mockResolvedValue(pending);
    fileStore.markFailed.mockResolvedValue(null);

    await expect(
      new FileService(fileStore, objectStorage).finalize(
        'user-1',
        pending.id,
        now,
      ),
    ).rejects.toBeInstanceOf(ConflictException);

    expect(objectStorage.deleteObject.mock.calls).toHaveLength(0);
  });

  it('keeps cross-user or missing upload ids opaque', async () => {
    const fileStore = store();
    const objectStorage = storage();
    fileStore.findOwned.mockResolvedValue(null);

    await expect(
      new FileService(fileStore, objectStorage).finalize(
        'user-2',
        asset().id,
        now,
      ),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('fails legacy unscanned ready metadata closed instead of issuing access', async () => {
    const fileStore = store();
    const objectStorage = storage();
    const legacy = asset({
      state: 'ready',
      verifiedMimeType: undefined,
      actualByteSize: undefined,
      readyAt: now,
      scanEngine: undefined,
      scanCompletedAt: undefined,
    });
    fileStore.findOwned.mockResolvedValue(legacy);
    fileStore.claimForScan.mockResolvedValue(
      asset({
        ...legacy,
        state: 'scanning',
        scanAttempts: 1,
        scanClaimId: 'claim-1',
        scanLeaseExpiresAt: new Date(now.getTime() + 60_000),
      }),
    );

    await expect(
      new FileService(fileStore, objectStorage).finalize(
        'user-1',
        legacy.id,
        now,
      ),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);
    const activeClaimId = fileStore.claimForScan.mock.calls[0]?.[1];
    expect(activeClaimId).toEqual(expect.any(String));
    expect(fileStore.markScanFailed).toHaveBeenCalledWith(
      legacy.id,
      activeClaimId,
      'SCAN_METADATA_INVALID',
      expect.any(Date),
    );
    expect(objectStorage.createDownloadIntent).not.toHaveBeenCalled();
  });

  it('treats a missing stored Content-Type as an invalid finalized upload', async () => {
    const fileStore = store();
    const objectStorage = storage();
    const pending = asset();

    fileStore.findOwned.mockResolvedValue(pending);
    fileStore.markFailed.mockResolvedValue(
      asset({
        state: 'failed',
        failureCode: 'CONTENT_TYPE_MISMATCH',
      }),
    );
    objectStorage.headObject.mockResolvedValue({
      byteSize: pending.expectedByteSize,
      contentType: null,
      etag: null,
    });

    await expect(
      new FileService(fileStore, objectStorage).finalize(
        'user-1',
        pending.id,
        now,
      ),
    ).rejects.toBeInstanceOf(UnprocessableEntityException);

    expect(objectStorage.deleteObject.mock.calls).toContainEqual([
      pending.objectKey,
    ]);
  });

  it('returns a complete ready asset to an already-authorized Resource', async () => {
    const fileStore = store();
    const objectStorage = storage();
    const ready = asset({
      state: 'ready',
      verifiedMimeType: 'application/pdf',
      actualByteSize: 8,
      readyAt: now,
      scanEngine: 'test-clean-v1',
      scanCompletedAt: now,
    });
    fileStore.findById.mockResolvedValue(ready);

    await expect(
      new FileService(fileStore, objectStorage).getReadyAssetForResource(
        ready.id,
      ),
    ).resolves.toBe(ready);
  });

  it('does not mask invalid bytes when best-effort failed-upload deletion is unavailable', async () => {
    const fileStore = store();
    const objectStorage = storage();
    const pending = asset();

    fileStore.findOwned.mockResolvedValue(pending);
    fileStore.markFailed.mockResolvedValue(
      asset({
        state: 'failed',
        failureCode: 'CONTENT_SIGNATURE_MISMATCH',
      }),
    );
    objectStorage.headObject.mockResolvedValue({
      byteSize: 8,
      contentType: 'application/pdf',
      etag: null,
    });
    objectStorage.readPrefix.mockResolvedValue(
      new Uint8Array(Buffer.from('NOTPDF!!')),
    );
    objectStorage.deleteObject.mockRejectedValue(new Error('storage delete'));

    await expect(
      new FileService(fileStore, objectStorage).finalize(
        'user-1',
        pending.id,
        now,
      ),
    ).rejects.toBeInstanceOf(UnprocessableEntityException);
  });

  it('reclaims expired objects and leaves failed deletes retryable', async () => {
    const fileStore = store();
    const objectStorage = storage();
    const reclaimable = [
      asset({ id: 'a', objectKey: 'a', state: 'pending' }),
      asset({ id: 'b', objectKey: 'b', state: 'failed' }),
    ];
    fileStore.listReclaimable.mockResolvedValue(reclaimable);
    fileStore.claimForReclamation
      .mockResolvedValueOnce({
        ...reclaimable[0],
        state: 'reclaiming',
      })
      .mockResolvedValueOnce({
        ...reclaimable[1],
        state: 'reclaiming',
      });
    objectStorage.deleteObject
      .mockResolvedValueOnce()
      .mockRejectedValueOnce(new Error('temporary'));
    fileStore.markReclaimed.mockResolvedValue(true);

    const result = await new FileService(
      fileStore,
      objectStorage,
    ).cleanupExpiredAssets(20, now);

    expect(result).toEqual({ examined: 2, reclaimed: 1 });
    expect(fileStore.claimForReclamation.mock.calls).toContainEqual([
      'a',
      'pending',
      now,
    ]);
    expect(fileStore.markReclaimed.mock.calls).toContainEqual(['a', now]);
    expect(fileStore.markReclaimed.mock.calls).toHaveLength(1);

    fileStore.listReclaimable.mockResolvedValue([
      asset({ id: 'c', objectKey: 'c', state: 'ready' }),
      asset({ id: 'd', objectKey: 'd', state: 'reclaimed' }),
    ]);
    fileStore.claimForReclamation.mockReset().mockResolvedValue(null);
    objectStorage.deleteObject.mockClear();

    const skipped = await new FileService(
      fileStore,
      objectStorage,
    ).cleanupExpiredAssets(20, now);

    expect(skipped).toEqual({ examined: 2, reclaimed: 0 });
    expect(objectStorage.deleteObject.mock.calls).toHaveLength(0);
  });

  it('rescans legacy ready assets before treating them as shareable', async () => {
    const fileStore = store();
    const objectStorage = storage();
    const legacy = asset({
      state: 'ready',
      verifiedMimeType: 'application/pdf',
      actualByteSize: 8,
      readyAt: now,
      scanEngine: undefined,
      scanCompletedAt: undefined,
    });
    fileStore.findOwned.mockResolvedValue(legacy);

    const result = await new FileService(
      fileStore,
      objectStorage,
    ).finalize('user-1', legacy.id, now);

    expect(result.file.state).toBe('ready');
    expect(fileStore.claimForScan).toHaveBeenCalledTimes(1);
    expect(fileStore.markReadyFromScan).toHaveBeenCalledTimes(1);
  });

  it('rejects malicious bytes and deletes quarantined storage best effort', async () => {
    const fileStore = store();
    const objectStorage = storage();
    const pending = asset();
    fileStore.findOwned.mockResolvedValue(pending);
    objectStorage.headObject.mockResolvedValue({
      byteSize: 8,
      contentType: 'application/pdf',
      etag: 'etag-malicious',
    });
    objectStorage.readPrefix.mockResolvedValue(
      new Uint8Array(Buffer.from('%PDF-1.7')),
    );
    const scanner = {
      scan: jest.fn().mockResolvedValue({
        verdict: 'malicious' as const,
        engine: 'test-malware-v1',
      }),
    };

    await expect(
      new FileService(
        fileStore,
        objectStorage,
        undefined,
        scanner,
      ).finalize('user-1', pending.id, now),
    ).rejects.toMatchObject({
      response: expect.objectContaining({
        code: 'FILE_SCAN_REJECTED',
      }),
    });

    expect(fileStore.markRejectedFromScan).toHaveBeenCalledTimes(1);
    expect(objectStorage.deleteObject).toHaveBeenCalledWith(
      pending.objectKey,
    );
  });

  it('keeps scanner outages quarantined and schedules bounded retry', async () => {
    const fileStore = store();
    const objectStorage = storage();
    const pending = asset();
    fileStore.findOwned.mockResolvedValue(pending);
    objectStorage.headObject.mockResolvedValue({
      byteSize: 8,
      contentType: 'application/pdf',
      etag: null,
    });
    objectStorage.readPrefix.mockResolvedValue(
      new Uint8Array(Buffer.from('%PDF-1.7')),
    );
    const scanner = {
      scan: jest.fn().mockRejectedValue(new Error('scanner offline')),
    };

    await expect(
      new FileService(
        fileStore,
        objectStorage,
        undefined,
        scanner,
      ).finalize('user-1', pending.id, now),
    ).rejects.toMatchObject({
      response: expect.objectContaining({
        code: 'FILE_SCAN_PENDING',
      }),
    });

    expect(fileStore.rescheduleScan).toHaveBeenCalledWith(
      pending.id,
      expect.any(String),
      expect.objectContaining({
        failureCode: 'SCANNER_UNAVAILABLE',
        scanNextAttemptAt: expect.any(Date),
      }),
    );
  });

  it('processes durable quarantine backlog with claimed ownership', async () => {
    const fileStore = store();
    const objectStorage = storage();
    const quarantined = asset({
      state: 'scan_pending',
      verifiedMimeType: 'application/pdf',
      actualByteSize: 8,
      scanAttempts: 0,
      scanNextAttemptAt: now,
      expiresAt: new Date(now.getTime() + 60_000),
    });
    fileStore.listScannable.mockResolvedValue([quarantined]);
    const scanner = {
      scan: jest.fn().mockResolvedValue({
        verdict: 'clean' as const,
        engine: 'test-worker-v1',
      }),
    };

    const result = await new FileService(
      fileStore,
      objectStorage,
      undefined,
      scanner,
    ).processPendingScans(20, now);

    expect(result).toEqual({
      examined: 1,
      clean: 1,
      rejected: 0,
      retryScheduled: 0,
      failed: 0,
      busy: 0,
    });
    expect(fileStore.claimForScan).toHaveBeenCalledWith(
      quarantined.id,
      expect.any(String),
      now,
      expect.any(Date),
    );
    expect(fileStore.markReadyFromScan).toHaveBeenCalledTimes(1);
  });

  it('fails a scan closed after the bounded retry budget is exhausted', async () => {
    const fileStore = store();
    const objectStorage = storage();
    const quarantined = asset({
      state: 'scan_pending',
      verifiedMimeType: 'application/pdf',
      actualByteSize: 8,
      expiresAt: new Date(now.getTime() + 60_000),
    });
    fileStore.listScannable.mockResolvedValue([quarantined]);
    fileStore.claimForScan.mockImplementation(
      (id, claimId, claimedAt, leaseExpiresAt) =>
        Promise.resolve(
          asset({
            id,
            state: 'scanning',
            verifiedMimeType: 'application/pdf',
            actualByteSize: 8,
            scanAttempts: 5,
            scanClaimId: claimId,
            scanStartedAt: claimedAt,
            scanLeaseExpiresAt: leaseExpiresAt,
            expiresAt: new Date(now.getTime() + 60_000),
          }),
        ),
    );
    const scanner = {
      scan: jest.fn().mockRejectedValue(new Error('scanner offline')),
    };

    const result = await new FileService(
      fileStore,
      objectStorage,
      undefined,
      scanner,
    ).processPendingScans(20, now);

    expect(result.failed).toBe(1);
    expect(fileStore.markScanFailed).toHaveBeenCalledWith(
      quarantined.id,
      expect.any(String),
      'SCAN_RETRY_EXHAUSTED',
      expect.any(Date),
    );
    expect(fileStore.rescheduleScan).not.toHaveBeenCalled();
  });

});
