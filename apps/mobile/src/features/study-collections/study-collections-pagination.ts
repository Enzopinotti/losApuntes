export function recordStudyCollectionPageCursor(
  history: Set<string>,
  requestedCursor: string,
  nextCursor: string | null,
): boolean {
  const repeated =
    nextCursor !== null &&
    (nextCursor === requestedCursor || history.has(nextCursor));
  history.add(requestedCursor);
  return repeated;
}

type PageTicket = Readonly<{ scope: string; cursor: string }>;

export class StudyCollectionPageChain {
  private scope: string | null = null;
  private active: PageTicket | null = null;
  private readonly history = new Set<string>();

  setScope(scope: string | null): void {
    if (scope === this.scope) return;
    this.scope = scope;
    this.active = null;
    this.history.clear();
  }

  begin(scope: string | null, cursor: string): PageTicket | null {
    if (!scope || scope !== this.scope || this.active) return null;
    const ticket = { scope, cursor };
    this.active = ticket;
    return ticket;
  }

  isCurrent(ticket: PageTicket): boolean {
    return this.active === ticket && this.scope === ticket.scope;
  }

  record(ticket: PageTicket, nextCursor: string | null): boolean | null {
    if (!this.isCurrent(ticket)) return null;
    return recordStudyCollectionPageCursor(
      this.history,
      ticket.cursor,
      nextCursor,
    );
  }

  finish(ticket: PageTicket): void {
    if (this.active === ticket) this.active = null;
  }
}
