import type { Connection } from 'mongoose';

import type { ObjectStorage } from '../files/storage/object-storage';
import { HealthService } from './health.service';

function connectionStub(
  readyState: number,
  ping: () => Promise<unknown>,
): Connection {
  return {
    readyState,
    db: {
      admin: () => ({ ping }),
    },
  } as unknown as Connection;
}

function storageStub(
  headObject: ObjectStorage['headObject'] = () => Promise.resolve(null),
): ObjectStorage {
  return {
    providerId: 's3',
    createUploadIntent: jest.fn(),
    headObject,
    readPrefix: jest.fn(),
    readObjectChunks: jest.fn(),
    createDownloadIntent: jest.fn(),
    deleteObject: jest.fn(),
  };
}

describe('HealthService', () => {
  it('keeps liveness independent from dependency state', () => {
    const service = new HealthService(
      connectionStub(0, () => Promise.reject(new Error('offline'))),
      storageStub(() => Promise.reject(new Error('storage offline'))),
    );

    expect(service.liveness()).toEqual({
      status: 'ok',
      service: 'api',
    });
  });

  it('reports ready publicly without exposing dependency names', async () => {
    const ping = jest.fn(() => Promise.resolve({ ok: 1 }));
    const headObject = jest.fn(() => Promise.resolve(null));
    const service = new HealthService(
      connectionStub(1, ping),
      storageStub(headObject),
    );

    await expect(service.readiness()).resolves.toEqual({
      status: 'ready',
      service: 'api',
    });
    expect(ping).toHaveBeenCalledTimes(1);
    expect(headObject).toHaveBeenCalledWith('__health__/probe', 1_500);
  });

  it('keeps optional storage failure degraded instead of not-ready', async () => {
    const service = new HealthService(
      connectionStub(1, () => Promise.resolve({ ok: 1 })),
      storageStub(() =>
        Promise.reject(new Error('https://secret-storage.example.invalid')),
      ),
    );

    await expect(service.readiness()).resolves.toEqual({
      status: 'degraded',
      service: 'api',
    });

    const diagnostics = await service.diagnostics();
    expect(diagnostics.status).toBe('degraded');
    expect(diagnostics.checks).toEqual([
      { name: 'mongo', status: 'ok', required: true },
      { name: 'storage', status: 'failed', required: false },
    ]);
    expect(JSON.stringify(diagnostics)).not.toContain('secret-storage');
  });

  it('returns not_ready when required Mongo authority fails', async () => {
    const service = new HealthService(
      connectionStub(1, () =>
        Promise.reject(
          new Error(
            'mongodb://user:password@private.example.invalid/losapuntes',
          ),
        ),
      ),
      storageStub(),
    );

    const result = await service.readiness();

    expect(result).toEqual({
      status: 'not_ready',
      service: 'api',
    });
    expect(JSON.stringify(result)).not.toContain('private.example');
    expect(JSON.stringify(result)).not.toContain('password');
  });

  it('bounds a hanging Mongo readiness check', async () => {
    const service = new HealthService(
      connectionStub(1, () => new Promise(() => undefined)),
      storageStub(),
    );

    const startedAt = Date.now();
    const result = await service.readiness(10);

    expect(result.status).toBe('not_ready');
    expect(Date.now() - startedAt).toBeLessThan(500);
  });
});
