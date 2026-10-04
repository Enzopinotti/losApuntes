export const OPERATIONAL_ALERT_SIGNALS = [
  'api.not_ready',
  'api.degraded',
  'worker.not_ready',
] as const;

export type OperationalAlertSignal =
  (typeof OPERATIONAL_ALERT_SIGNALS)[number];

export type OperationalAlertPhase = 'active' | 'recovery';

export type OperationalAlertPolicy = {
  activationAfterMs: number;
  repeatCooldownMs: number | null;
};

export type OperationalAlertEvent = {
  signal: OperationalAlertSignal;
  phase: OperationalAlertPhase;
  activeSince: string;
  observedAt: string;
};

type AlertState = {
  active: boolean;
  unhealthySinceMs: number;
  lastActiveEmissionMs: number | null;
  lastObservedAtMs: number;
};

const MAX_TIMESTAMP_MS = 8_640_000_000_000_000;
const operationalAlertSignalSet = new Set<string>(OPERATIONAL_ALERT_SIGNALS);

function assertSignal(signal: string): asserts signal is OperationalAlertSignal {
  if (!operationalAlertSignalSet.has(signal)) {
    throw new Error('signal must be an allow-listed operational alert signal');
  }
}

function assertDuration(name: string, value: number): void {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new Error(`${name} must be a non-negative safe integer`);
  }
}

function assertPolicy(policy: OperationalAlertPolicy): void {
  assertDuration('activationAfterMs', policy.activationAfterMs);

  if (policy.repeatCooldownMs !== null) {
    if (
      !Number.isSafeInteger(policy.repeatCooldownMs) ||
      policy.repeatCooldownMs <= 0
    ) {
      throw new Error(
        'repeatCooldownMs must be null or a positive safe integer',
      );
    }
  }
}

function assertTimestamp(observedAtMs: number): void {
  if (
    !Number.isSafeInteger(observedAtMs) ||
    observedAtMs < 0 ||
    observedAtMs > MAX_TIMESTAMP_MS
  ) {
    throw new Error('observedAtMs must be a valid non-negative timestamp');
  }
}

function eventFor(
  signal: OperationalAlertSignal,
  phase: OperationalAlertPhase,
  state: AlertState,
  observedAtMs: number,
): OperationalAlertEvent {
  return {
    signal,
    phase,
    activeSince: new Date(state.unhealthySinceMs).toISOString(),
    observedAt: new Date(observedAtMs).toISOString(),
  };
}

export class OperationalAlertBoundary {
  private readonly states = new Map<OperationalAlertSignal, AlertState>();

  observe(input: {
    signal: OperationalAlertSignal;
    unhealthy: boolean;
    observedAtMs: number;
    policy: OperationalAlertPolicy;
  }): OperationalAlertEvent | null {
    assertSignal(input.signal);
    assertTimestamp(input.observedAtMs);
    assertPolicy(input.policy);

    const previous = this.states.get(input.signal);

    if (
      previous !== undefined &&
      input.observedAtMs < previous.lastObservedAtMs
    ) {
      return null;
    }

    if (!input.unhealthy) {
      if (previous === undefined) return null;

      this.states.delete(input.signal);
      return previous.active
        ? eventFor(input.signal, 'recovery', previous, input.observedAtMs)
        : null;
    }

    const state =
      previous ??
      ({
        active: false,
        unhealthySinceMs: input.observedAtMs,
        lastActiveEmissionMs: null,
        lastObservedAtMs: input.observedAtMs,
      } satisfies AlertState);

    state.lastObservedAtMs = input.observedAtMs;
    this.states.set(input.signal, state);

    if (!state.active) {
      const unhealthyForMs = input.observedAtMs - state.unhealthySinceMs;
      if (unhealthyForMs < input.policy.activationAfterMs) return null;

      state.active = true;
      state.lastActiveEmissionMs = input.observedAtMs;
      return eventFor(input.signal, 'active', state, input.observedAtMs);
    }

    if (
      input.policy.repeatCooldownMs === null ||
      state.lastActiveEmissionMs === null ||
      input.observedAtMs - state.lastActiveEmissionMs <
        input.policy.repeatCooldownMs
    ) {
      return null;
    }

    state.lastActiveEmissionMs = input.observedAtMs;
    return eventFor(input.signal, 'active', state, input.observedAtMs);
  }
}

export type ApiOperationalStatus = 'ready' | 'degraded' | 'not_ready';
export type WorkerOperationalStatus = 'ready' | 'not_ready';

export function apiAlertObservations(status: ApiOperationalStatus): ReadonlyArray<{
  signal: Extract<OperationalAlertSignal, 'api.not_ready' | 'api.degraded'>;
  unhealthy: boolean;
}> {
  return [
    {
      signal: 'api.not_ready',
      unhealthy: status === 'not_ready',
    },
    {
      signal: 'api.degraded',
      unhealthy: status === 'degraded',
    },
  ];
}

export function workerAlertObservation(
  status: WorkerOperationalStatus,
): {
  signal: 'worker.not_ready';
  unhealthy: boolean;
} {
  return {
    signal: 'worker.not_ready',
    unhealthy: status === 'not_ready',
  };
}
