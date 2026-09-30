import { HealthController } from './health.controller';
import { HealthService, type ReadinessResult } from './health.service';

describe('HealthController', () => {
  it('returns 503 for failed required readiness', async () => {
    const result: ReadinessResult = {
      status: 'not_ready',
      service: 'api',
    };
    const health = {
      liveness: jest.fn(),
      readiness: jest.fn(() => Promise.resolve(result)),
    } as unknown as HealthService;
    const controller = new HealthController(health);
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
      const health = {
        liveness: jest.fn(),
        readiness: jest.fn(() => Promise.resolve(result)),
      } as unknown as HealthService;
      const controller = new HealthController(health);
      const reply = {
        status: jest.fn().mockReturnThis(),
      };

      await expect(controller.ready(reply)).resolves.toEqual(result);
      expect(reply.status).not.toHaveBeenCalled();
    },
  );
});
