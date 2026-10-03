import { HealthController } from './health.controller';
import { HealthService, type ReadinessResult } from './health.service';
import {
  ReleaseIdentityService,
  type ReleaseIdentityResult,
} from './release-identity.service';

describe('HealthController', () => {
  function createController(
    readiness: ReadinessResult,
    release: ReleaseIdentityResult = {
      status: 'unavailable',
      service: 'api',
    },
  ) {
    const health = {
      liveness: jest.fn(),
      readiness: jest.fn(() => Promise.resolve(readiness)),
    } as unknown as HealthService;
    const releaseIdentity = {
      current: jest.fn(() => release),
    } as unknown as ReleaseIdentityService;

    return new HealthController(health, releaseIdentity);
  }

  it('returns 503 for failed required readiness', async () => {
    const result: ReadinessResult = {
      status: 'not_ready',
      service: 'api',
    };
    const controller = createController(result);
    const reply = {
      status: jest.fn().mockReturnThis(),
    };

    await expect(controller.ready(reply)).resolves.toEqual(result);
    expect(reply.status).toHaveBeenCalledWith(503);
  });

  it.each(['ready', 'degraded'] as const)(
    'keeps HTTP 200 semantics for %s',
    async (status) => {
      const result: ReadinessResult = {
        status,
        service: 'api',
      };
      const controller = createController(result);
      const reply = {
        status: jest.fn().mockReturnThis(),
      };

      await expect(controller.ready(reply)).resolves.toEqual(result);
      expect(reply.status).not.toHaveBeenCalled();
    },
  );

  it('returns 503 when release identity is not configured', () => {
    const controller = createController(
      { status: 'ready', service: 'api' },
      { status: 'unavailable', service: 'api' },
    );
    const reply = {
      status: jest.fn().mockReturnThis(),
    };

    expect(controller.release(reply)).toEqual({
      status: 'unavailable',
      service: 'api',
    });
    expect(reply.status).toHaveBeenCalledWith(503);
  });

  it('returns observable release identity without changing status', () => {
    const release: ReleaseIdentityResult = {
      status: 'available',
      service: 'api',
      releaseId: 'api-2026.10.03-1',
      sourceSha: 'b3ee3473c4f623a4405227d246260865474d0050',
    };
    const controller = createController(
      { status: 'ready', service: 'api' },
      release,
    );
    const reply = {
      status: jest.fn().mockReturnThis(),
    };

    expect(controller.release(reply)).toEqual(release);
    expect(reply.status).not.toHaveBeenCalled();
  });
});
