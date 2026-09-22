import type { Connection } from 'mongoose';

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

describe('HealthService', () => {
  it('keeps liveness independent from Mongo state', () => {
    const service = new HealthService(
      connectionStub(0, () => Promise.reject(new Error('offline'))),
    );

    expect(service.liveness()).toEqual({
      status: 'ok',
      service: 'api',
    });
  });

  it('reports ready only after a successful Mongo ping', async () => {
    const ping = jest.fn(() => Promise.resolve({ ok: 1 }));
    const service = new HealthService(connectionStub(1, ping));

    await expect(service.readiness()).resolves.toEqual({
      status: 'ready',
      service: 'api',
      checks: [
        {
          name: 'mongo',
          status: 'ok',
          required: true,
        },
      ],
    });
    expect(ping).toHaveBeenCalledTimes(1);
  });

  it('sanitizes a Mongo readiness failure', async () => {
    const service = new HealthService(
      connectionStub(1, () =>
        Promise.reject(
          new Error(
            'mongodb://user:password@private.example.invalid/losapuntes',
          ),
        ),
      ),
    );

    const result = await service.readiness();

    expect(result).toEqual({
      status: 'not_ready',
      service: 'api',
      checks: [
        {
          name: 'mongo',
          status: 'failed',
          required: true,
        },
      ],
    });
    expect(JSON.stringify(result)).not.toContain('private.example');
    expect(JSON.stringify(result)).not.toContain('password');
  });

  it('bounds a hanging Mongo readiness check', async () => {
    const service = new HealthService(
      connectionStub(
        1,
        () => new Promise(() => undefined),
      ),
    );

    const startedAt = Date.now();
    const result = await service.readiness(10);

    expect(result.status).toBe('not_ready');
    expect(Date.now() - startedAt).toBeLessThan(500);
  });
});
