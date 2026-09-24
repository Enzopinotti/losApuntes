import type { AbuseRateWindowRecord } from './abuse-control.types';

export const ABUSE_CONTROL_STORE = Symbol('ABUSE_CONTROL_STORE');

export interface AbuseControlStore {
  consume(input: {
    key: string;
    scope: string;
    windowStartedAt: Date;
    expiresAt: Date;
  }): Promise<AbuseRateWindowRecord>;
}
