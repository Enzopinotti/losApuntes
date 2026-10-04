export type AsyncAuthorityTicket = {
  epoch: number;
  scopeKey: string;
  signal: AbortSignal;
};

export class AsyncAuthorityFence {
  private epoch = 0;
  private currentScopeKey: string;
  private controller: AbortController | null = null;
  private suspended = false;
  private disposed = false;

  constructor(scopeKey: string) {
    this.currentScopeKey = scopeKey;
  }

  setScope(scopeKey: string): void {
    if (this.disposed || this.currentScopeKey === scopeKey) return;

    this.currentScopeKey = scopeKey;
    this.invalidate();
  }

  begin(scopeKey: string): AsyncAuthorityTicket {
    if (this.disposed || this.suspended || scopeKey !== this.currentScopeKey) {
      return {
        epoch: this.epoch,
        scopeKey,
        signal: AbortSignal.abort(),
      };
    }

    this.epoch += 1;
    this.controller?.abort();

    const controller = new AbortController();
    this.controller = controller;

    return {
      epoch: this.epoch,
      scopeKey,
      signal: controller.signal,
    };
  }

  isCurrent(ticket: AsyncAuthorityTicket): boolean {
    return (
      !this.disposed &&
      !this.suspended &&
      ticket.epoch === this.epoch &&
      ticket.scopeKey === this.currentScopeKey &&
      !ticket.signal.aborted
    );
  }

  finish(ticket: AsyncAuthorityTicket): boolean {
    if (!this.isCurrent(ticket)) return false;
    this.controller = null;
    return true;
  }

  invalidate(): void {
    if (this.disposed) return;

    this.epoch += 1;
    this.controller?.abort();
    this.controller = null;
  }

  suspend(): void {
    if (this.disposed || this.suspended) return;

    this.suspended = true;
    this.invalidate();
  }

  resume(): void {
    if (this.disposed) return;

    this.suspended = false;
  }

  dispose(): void {
    if (this.disposed) return;

    this.disposed = true;
    this.epoch += 1;
    this.controller?.abort();
    this.controller = null;
  }
}
