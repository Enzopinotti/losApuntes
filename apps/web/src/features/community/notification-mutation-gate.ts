/**
 * Synchronous client-side lease for notification mutations. This prevents
 * double-click races before React commits a busy render; the API still
 * authorizes every operation. Old-session completions cannot release a new
 * session's lease.
 */
export type NotificationMutationLease = Readonly<{
  authorityScope: string;
  actionKey: string;
  sequence: number;
}>;

export class NotificationMutationGate {
  private current: NotificationMutationLease | null = null;
  private sequence = 0;

  tryAcquire(
    authorityScope: string,
    actionKey: string,
  ): NotificationMutationLease | null {
    if (!authorityScope || !actionKey) return null;
    if (this.current?.authorityScope === authorityScope) return null;

    const lease: NotificationMutationLease = {
      authorityScope,
      actionKey,
      sequence: ++this.sequence,
    };
    this.current = lease;
    return lease;
  }

  release(lease: NotificationMutationLease): boolean {
    if (this.current !== lease) return false;
    this.current = null;
    return true;
  }
}
