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

  it('ignores stale observations instead of rewinding alert ownership', () => {
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
