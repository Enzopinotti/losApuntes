import { HealthController } from './health.controller';
import {
  HealthService,
  type ReadinessResult,
} from './health.service';

describe('HealthController', () => {
  it('returns 503 for a failed required readiness check', async () => {
    const result: ReadinessResult = {
      status: 'not_ready',
      service: 'api',
      checks: [
        {
          name: 'mongo',
          status: 'failed',
          required: true,
        },
      ],
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

  it('does not override the HTTP status when ready', async () => {
    const result: ReadinessResult = {
      status: 'ready',
      service: 'api',
      checks: [
        {
          name: 'mongo',
          status: 'ok',
          required: true,
        },
      ],
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
  });
});
