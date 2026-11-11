/**
 * Synchronous, session-scoped lease for sensitive Web Security mutations.
 * React render disabled states are not synchronous click locks.
 *
 * Only the original lease object may release the active operation. A prior
 * account's late response can never unlock a newer account's mutation.
 */
export type SecurityActionLease = Readonly<{
  authorityScope: string;
  actionKey: string;
  sequence: number;
}>;

export class SecurityActionGate {
  private current: SecurityActionLease | null = null;
  private sequence = 0;

  tryAcquire(
    authorityScope: string,
    actionKey: string,
  ): SecurityActionLease | null {
    if (!authorityScope || !actionKey) return null;
    if (this.current?.authorityScope === authorityScope) return null;
    const lease: SecurityActionLease = {
      authorityScope,
      actionKey,
      sequence: ++this.sequence,
    };
    this.current = lease;
    return lease;
  }

  release(lease: SecurityActionLease): boolean {
    if (this.current !== lease) return false;
    this.current = null;
    return true;
  }
}
