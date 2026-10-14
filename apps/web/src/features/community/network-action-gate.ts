/**
 * Client-side concurrency guard for Network interactions. This is not an
 * authorization mechanism: the backend still validates every mutation.
 *
 * A new authenticated scope can acquire immediately. An older request can
 * never release the new scope's action (even when its finally handler runs).
 */
export type NetworkActionLease = Readonly<{
  authorityScope: string;
  actionKey: string;
  sequence: number;
}>;

export class NetworkActionGate {
  private current: NetworkActionLease | null = null;
  private sequence = 0;

  tryAcquire(
    authorityScope: string,
    actionKey: string,
  ): NetworkActionLease | null {
    if (!authorityScope || !actionKey) return null;
    if (this.current?.authorityScope === authorityScope) return null;

    const lease: NetworkActionLease = {
      authorityScope,
      actionKey,
      sequence: ++this.sequence,
    };
    this.current = lease;
    return lease;
  }

  release(lease: NetworkActionLease): boolean {
    if (this.current !== lease) return false;
    this.current = null;
    return true;
  }
}
