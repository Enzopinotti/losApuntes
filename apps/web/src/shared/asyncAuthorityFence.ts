export type AsyncAuthorityTicket = {
  epoch: number;
  scopeKey: string;
  signal: AbortSignal;
};

export class AsyncAuthorityFence {
  private epoch = 0;
  private currentScopeKey: string;
  private controller: AbortController | null = null;

  constructor(scopeKey: string) {
    this.currentScopeKey = scopeKey;
  }

  setScope(scopeKey: string): void {
    if (this.currentScopeKey === scopeKey) return;

    this.currentScopeKey = scopeKey;
    this.invalidate();
  }

  begin(scopeKey: string): AsyncAuthorityTicket {
    if (scopeKey !== this.currentScopeKey) {
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
    this.epoch += 1;
    this.controller?.abort();
    this.controller = null;
  }

  dispose(): void {
    this.invalidate();
  }
}
