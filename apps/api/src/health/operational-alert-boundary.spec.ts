import type { OperationalAlertPolicy } from './operational-alert-boundary';
import {
  OperationalAlertBoundary,
  apiAlertObservations,
  workerAlertObservation,
} from './operational-alert-boundary';

const policy = {
  activationAfterMs: 1_000,
  repeatCooldownMs: 5_000,
};

describe('OperationalAlertBoundary', () => {
  it('waits for a sustained unhealthy window before activating', () => {
    const boundary = new OperationalAlertBoundary();

    expect(
      boundary.observe({
        signal: 'api.not_ready',
        unhealthy: true,
        observedAtMs: 10_000,
        policy,
      }),
    ).toBeNull();
    expect(
      boundary.observe({
        signal: 'api.not_ready',
        unhealthy: true,
        observedAtMs: 10_999,
        policy,
      }),
    ).toBeNull();

    expect(
      boundary.observe({
        signal: 'api.not_ready',
        unhealthy: true,
        observedAtMs: 11_000,
        policy,
      }),
    ).toEqual({
      signal: 'api.not_ready',
      phase: 'active',
      activeSince: '1970-01-01T00:00:10.000Z',
      observedAt: '1970-01-01T00:00:11.000Z',
    });
  });

  it('drops a transient failure that recovers before activation', () => {
    const boundary = new OperationalAlertBoundary();

    expect(
      boundary.observe({
        signal: 'api.degraded',
        unhealthy: true,
        observedAtMs: 20_000,
        policy,
      }),
    ).toBeNull();
    expect(
      boundary.observe({
        signal: 'api.degraded',
        unhealthy: false,
        observedAtMs: 20_500,
        policy,
      }),
    ).toBeNull();
    expect(
      boundary.observe({
        signal: 'api.degraded',
        unhealthy: true,
        observedAtMs: 21_000,
        policy,
      }),
    ).toBeNull();
  });

  it('deduplicates active observations until the configured cooldown', () => {
    const boundary = new OperationalAlertBoundary();
    const immediate = {
      activationAfterMs: 0,
      repeatCooldownMs: 5_000,
    };

    expect(
      boundary.observe({
        signal: 'worker.not_ready',
        unhealthy: true,
        observedAtMs: 30_000,
        policy: immediate,
      }),
    ).toMatchObject({ phase: 'active' });

    expect(
      boundary.observe({
        signal: 'worker.not_ready',
        unhealthy: true,
        observedAtMs: 34_999,
        policy: immediate,
      }),
    ).toBeNull();

    expect(
      boundary.observe({
        signal: 'worker.not_ready',
        unhealthy: true,
        observedAtMs: 35_000,
        policy: immediate,
      }),
    ).toEqual({
      signal: 'worker.not_ready',
      phase: 'active',
      activeSince: '1970-01-01T00:00:30.000Z',
      observedAt: '1970-01-01T00:00:35.000Z',
    });
  });

  it('emits recovery exactly once after an active alert', () => {
    const boundary = new OperationalAlertBoundary();
    const immediate = {
      activationAfterMs: 0,
      repeatCooldownMs: null,
    };

    boundary.observe({
      signal: 'api.degraded',
      unhealthy: true,
      observedAtMs: 40_000,
      policy: immediate,
    });

    expect(
      boundary.observe({
        signal: 'api.degraded',
        unhealthy: false,
        observedAtMs: 41_000,
        policy: immediate,
      }),
    ).toEqual({
      signal: 'api.degraded',
      phase: 'recovery',
      activeSince: '1970-01-01T00:00:40.000Z',
      observedAt: '1970-01-01T00:00:41.000Z',
    });

    expect(
      boundary.observe({
        signal: 'api.degraded',
        unhealthy: false,
        observedAtMs: 42_000,
        policy: immediate,
      }),
    ).toBeNull();
  });

  it('ignores stale observations even after recovery clears active state', () => {
    const boundary = new OperationalAlertBoundary();
    const immediate = {
      activationAfterMs: 0,
      repeatCooldownMs: null,
    };

    boundary.observe({
      signal: 'api.not_ready',
      unhealthy: true,
      observedAtMs: 50_000,
      policy: immediate,
    });

    expect(
      boundary.observe({
        signal: 'api.not_ready',
        unhealthy: false,
        observedAtMs: 49_999,
        policy: immediate,
      }),
    ).toBeNull();

    expect(
      boundary.observe({
        signal: 'api.not_ready',
        unhealthy: false,
        observedAtMs: 51_000,
        policy: immediate,
      }),
    ).toMatchObject({ phase: 'recovery' });

    expect(
      boundary.observe({
        signal: 'api.not_ready',
        unhealthy: true,
        observedAtMs: 50_500,
        policy: immediate,
      }),
    ).toBeNull();

    expect(
      boundary.observe({
        signal: 'api.not_ready',
        unhealthy: true,
        observedAtMs: 52_000,
        policy: immediate,
      }),
    ).toMatchObject({
      signal: 'api.not_ready',
      phase: 'active',
      activeSince: '1970-01-01T00:00:52.000Z',
    });
  });

  it('maps API and worker states without exposing dependency details', () => {
    expect(apiAlertObservations('ready')).toEqual([
      { signal: 'api.not_ready', unhealthy: false },
      { signal: 'api.degraded', unhealthy: false },
    ]);
    expect(apiAlertObservations('degraded')).toEqual([
      { signal: 'api.not_ready', unhealthy: false },
      { signal: 'api.degraded', unhealthy: true },
    ]);
    expect(apiAlertObservations('not_ready')).toEqual([
      { signal: 'api.not_ready', unhealthy: true },
      { signal: 'api.degraded', unhealthy: false },
    ]);
    expect(workerAlertObservation('not_ready')).toEqual({
      signal: 'worker.not_ready',
      unhealthy: true,
    });
  });

  it('rejects runtime signal values outside the bounded allowlist', () => {
    const boundary = new OperationalAlertBoundary();

    expect(() =>
      boundary.observe({
        signal: 'api.not_ready:mongodb://secret' as 'api.not_ready',
        unhealthy: true,
        observedAtMs: 1,
        policy,
      }),
    ).toThrow('allow-listed operational alert signal');
  });

  it('reuses the exact signal value that passed runtime validation', () => {
    const boundary = new OperationalAlertBoundary();
    let signalReads = 0;
    const input = {
      get signal() {
        signalReads += 1;
        return signalReads === 1
          ? 'api.not_ready'
          : 'api.not_ready:mongodb://secret';
      },
      unhealthy: true,
      observedAtMs: 1,
      policy: {
        activationAfterMs: 0,
        repeatCooldownMs: null,
      },
    } as unknown as Parameters<OperationalAlertBoundary['observe']>[0];

    expect(boundary.observe(input)).toMatchObject({
      signal: 'api.not_ready',
      phase: 'active',
    });
    expect(signalReads).toBe(1);
  });

  it('reuses the exact policy scalars that passed validation', () => {
    const boundary = new OperationalAlertBoundary();
    let activationReads = 0;
    let cooldownReads = 0;
    const mutablePolicy = {
      get activationAfterMs() {
        activationReads += 1;
        return activationReads === 1 ? 1_000 : 0;
      },
      get repeatCooldownMs() {
        cooldownReads += 1;
        return cooldownReads === 1 ? 5_000 : 1;
      },
    } as OperationalAlertPolicy;

    expect(
      boundary.observe({
        signal: 'api.degraded',
        unhealthy: true,
        observedAtMs: 1_000,
        policy: mutablePolicy,
      }),
    ).toBeNull();
    expect(activationReads).toBe(1);
    expect(cooldownReads).toBe(1);
  });

  it('rejects invalid timing policy instead of silently inventing behavior', () => {
    const boundary = new OperationalAlertBoundary();

    expect(() =>
      boundary.observe({
        signal: 'api.not_ready',
        unhealthy: true,
        observedAtMs: 1,
        policy: {
          activationAfterMs: -1,
          repeatCooldownMs: 5_000,
        },
      }),
    ).toThrow('activationAfterMs');

    expect(() =>
      boundary.observe({
        signal: 'api.not_ready',
        unhealthy: true,
        observedAtMs: 1,
        policy: {
          activationAfterMs: 0,
          repeatCooldownMs: 0,
        },
      }),
    ).toThrow('repeatCooldownMs');
  });
});
