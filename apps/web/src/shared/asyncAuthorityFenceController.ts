export type AsyncAuthorityTicket = {
  epoch: number;
  scopeKey: string;
  signal: AbortSignal;
};

export class AsyncAuthorityFenceController {
  private epoch = 0;
  private scopeKey: string;
  private controller: AbortController | null = null;

  constructor(scopeKey: string) {
    this.scopeKey = scopeKey;
  }

  syncScope(scopeKey: string): void {
    if (scopeKey === this.scopeKey) return;

    this.scopeKey = scopeKey;
    this.epoch += 1;
  }

  abortActive(): void {
    this.controller?.abort();
    this.controller = null;
  }

  begin(): AsyncAuthorityTicket {
    this.epoch += 1;
    this.abortActive();

    const controller = new AbortController();
    this.controller = controller;

    return {
      epoch: this.epoch,
      scopeKey: this.scopeKey,
      signal: controller.signal,
    };
  }

  isCurrent(ticket: AsyncAuthorityTicket): boolean {
    return (
      ticket.epoch === this.epoch &&
      ticket.scopeKey === this.scopeKey &&
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
    this.abortActive();
  }
}
