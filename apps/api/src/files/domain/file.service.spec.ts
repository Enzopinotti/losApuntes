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
    create: jest.fn(),
    findOwned: jest.fn(),
    findById: jest.fn(),
    markReady: jest.fn(),
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
    createDownloadIntent: jest.fn(),
    deleteObject: jest.fn(),
  };
}

describe('FileService', () => {
  it('creates a private upload intent without exposing object keys', async () => {
    const fileStore = store();
    const objectStorage = storage();
    fileStore.create.mockImplementation(async (input) => ({
      ...input,
      createdAt: now,
      updatedAt: now,
    }));
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
        filename: '../Apunte final.pdf',
        mimeType: 'application/pdf',
        byteSize: 8,
      },
      now,
    );

    expect(result.file.filename).toBe('Apunte final.pdf');
    expect(result.upload.headers['if-none-match']).toBe('*');
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
          filename: 'virus.exe',
          mimeType: 'application/octet-stream',
          byteSize: 10,
        },
        now,
      ),
    ).rejects.toBeInstanceOf(UnprocessableEntityException);

    expect(fileStore.create).not.toHaveBeenCalled();
  });

  it('marks intent failed when storage cannot sign upload', async () => {
    const fileStore = store();
    const objectStorage = storage();
    const pending = asset();
    fileStore.create.mockResolvedValue(pending);
    objectStorage.createUploadIntent.mockRejectedValue(
      new Error('storage unavailable'),
    );

    await expect(
      new FileService(fileStore, objectStorage).createUploadIntent(
        'user-1',
        {
          filename: 'apunte.pdf',
          mimeType: 'application/pdf',
          byteSize: 8,
        },
        now,
      ),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);

    expect(fileStore.markFailed).toHaveBeenCalledWith(
      pending.id,
      'user-1',
      'STORAGE_UNAVAILABLE',
      expect.any(Date),
    );
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
    fileStore.markReady.mockResolvedValue(ready);

    const service = new FileService(fileStore, objectStorage);
    const first = await service.finalize('user-1', pending.id, now);
    const second = await service.finalize('user-1', pending.id, now);

    expect(first.file.state).toBe('ready');
    expect(second.file.id).toBe(pending.id);
    expect(objectStorage.headObject).toHaveBeenCalledTimes(1);
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

    expect(fileStore.markFailed).toHaveBeenCalledWith(
      pending.id,
      'user-1',
      'SIZE_MISMATCH',
      expect.any(Date),
    );
    expect(objectStorage.deleteObject).toHaveBeenCalledWith(pending.objectKey);
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

    expect(fileStore.markFailed).toHaveBeenCalledWith(
      pending.id,
      'user-1',
      'CONTENT_SIGNATURE_MISMATCH',
      expect.any(Date),
    );
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

    expect(fileStore.markFailed).toHaveBeenCalledWith(
      pending.id,
      'user-1',
      'UPLOAD_EXPIRED',
      expect.any(Date),
    );
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

    expect(fileStore.markFailed).not.toHaveBeenCalled();
  });

  it('creates bounded signed downloads only for complete ready assets', async () => {
    const fileStore = store();
    const objectStorage = storage();
    const ready = asset({
      state: 'ready',
      verifiedMimeType: 'application/pdf',
      actualByteSize: 8,
      readyAt: now,
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
    expect(objectStorage.createDownloadIntent).toHaveBeenCalledWith(
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

    expect(fileStore.markFailed).toHaveBeenCalledWith(
      pending.id,
      'user-1',
      'CONTENT_TYPE_MISMATCH',
      expect.any(Date),
    );
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
    fileStore.markReady.mockResolvedValue(null);

    await expect(
      new FileService(fileStore, objectStorage).finalize(
        'user-1',
        pending.id,
        now,
      ),
    ).resolves.toEqual({
      file: expect.objectContaining({ id: pending.id, state: 'ready' }),
    });

    fileStore.findOwned
      .mockReset()
      .mockResolvedValueOnce(pending)
      .mockResolvedValueOnce(asset({ state: 'failed' }));

    await expect(
      new FileService(fileStore, objectStorage).finalize(
        'user-1',
        pending.id,
        now,
      ),
    ).rejects.toBeInstanceOf(ConflictException);
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
    expect(objectStorage.createDownloadIntent).toHaveBeenLastCalledWith(
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

    expect(objectStorage.deleteObject).not.toHaveBeenCalled();
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

  it('fails loudly on corrupted ready metadata instead of issuing access', async () => {
    const fileStore = store();
    const objectStorage = storage();
    fileStore.findOwned.mockResolvedValue(
      asset({
        state: 'ready',
        verifiedMimeType: undefined,
        actualByteSize: undefined,
        readyAt: undefined,
      }),
    );

    await expect(
      new FileService(fileStore, objectStorage).finalize(
        'user-1',
        asset().id,
        now,
      ),
    ).rejects.toThrow('Ready file asset is incomplete');
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

    expect(objectStorage.deleteObject).toHaveBeenCalledWith(pending.objectKey);
  });

  it('returns a complete ready asset to an already-authorized Resource', async () => {
    const fileStore = store();
    const objectStorage = storage();
    const ready = asset({
      state: 'ready',
      verifiedMimeType: 'application/pdf',
      actualByteSize: 8,
      readyAt: now,
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
    expect(fileStore.claimForReclamation).toHaveBeenCalledWith(
      'a',
      'pending',
      now,
    );
    expect(fileStore.markReclaimed).toHaveBeenCalledWith('a', now);
    expect(fileStore.markReclaimed).toHaveBeenCalledTimes(1);

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
    expect(objectStorage.deleteObject).not.toHaveBeenCalled();
  });
});
