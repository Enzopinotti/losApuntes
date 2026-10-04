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

type ObservationWatermarkMap = Map<OperationalAlertSignal, number>;
type ApiAlertObservation = {
  signal: Extract<OperationalAlertSignal, 'api.not_ready' | 'api.degraded'>;
  unhealthy: boolean;
};

const MAX_TIMESTAMP_MS = 8_640_000_000_000_000;
const operationalAlertSignalSet = new Set<string>(OPERATIONAL_ALERT_SIGNALS);

function validatedSignal(signal: string): OperationalAlertSignal {
  if (!operationalAlertSignalSet.has(signal)) {
    throw new Error('signal must be an allow-listed operational alert signal');
  }

  return signal as OperationalAlertSignal;
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
  private readonly observationWatermarks: ObservationWatermarkMap = new Map();

  observe(input: {
    signal: OperationalAlertSignal;
    unhealthy: boolean;
    observedAtMs: number;
    policy: OperationalAlertPolicy;
  }): OperationalAlertEvent | null {
    const signalInput = input.signal;
    const unhealthy = input.unhealthy;
    const observedAtMs = input.observedAtMs;
    const policyInput = input.policy;
    const policy = {
      activationAfterMs: policyInput.activationAfterMs,
      repeatCooldownMs: policyInput.repeatCooldownMs,
    } satisfies OperationalAlertPolicy;

    const signal = validatedSignal(signalInput);
    assertTimestamp(observedAtMs);
    assertPolicy(policy);

    const watermark = this.observationWatermarks.get(signal);
    if (watermark !== undefined && observedAtMs < watermark) {
      return null;
    }
    this.observationWatermarks.set(signal, observedAtMs);

    const previous = this.states.get(signal);

    if (!unhealthy) {
      if (previous === undefined) return null;

      this.states.delete(signal);
      return previous.active
        ? eventFor(signal, 'recovery', previous, observedAtMs)
        : null;
    }

    const state =
      previous ??
      ({
        active: false,
        unhealthySinceMs: observedAtMs,
        lastActiveEmissionMs: null,
        lastObservedAtMs: observedAtMs,
      } satisfies AlertState);

    state.lastObservedAtMs = observedAtMs;
    this.states.set(signal, state);

    if (!state.active) {
      const unhealthyForMs = observedAtMs - state.unhealthySinceMs;
      if (unhealthyForMs < policy.activationAfterMs) return null;

      state.active = true;
      state.lastActiveEmissionMs = observedAtMs;
      return eventFor(signal, 'active', state, observedAtMs);
    }

    if (
      policy.repeatCooldownMs === null ||
      state.lastActiveEmissionMs === null ||
      observedAtMs - state.lastActiveEmissionMs < policy.repeatCooldownMs
    ) {
      return null;
    }

    state.lastActiveEmissionMs = observedAtMs;
    return eventFor(signal, 'active', state, observedAtMs);
  }
}

export type ApiOperationalStatus = 'ready' | 'degraded' | 'not_ready';
export type WorkerOperationalStatus = 'ready' | 'not_ready';

export function apiAlertObservations(
  status: ApiOperationalStatus,
): readonly ApiAlertObservation[] {
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
