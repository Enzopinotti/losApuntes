/**
 * Session-only navigation convenience, not a study-progress or reading-time
 * tracker. Holds bounded resource IDs only; never stores projections, file
 * access URLs, account credentials, titles or browsing timestamps.
 *
 * Every consumer MUST authorize each ID again before displaying metadata.
 */
export const RECENT_OPENED_MEMORY_LIMIT = 8;
export const RECENT_OPENED_PREVIEW_LIMIT = 4;

export class SessionRecentResourceOpens {
  private authorityKey: string | null = null;
  private ids: string[] = [];

  read(authorityKey: string | null): string[] {
    if (!authorityKey) return [];
    this.prepare(authorityKey);
    return [...this.ids];
  }

  record(authorityKey: string | null, resourceId: string): void {
    if (!authorityKey || !resourceId) return;
    this.prepare(authorityKey);
    this.ids = [
      resourceId,
      ...this.ids.filter((id) => id !== resourceId),
    ].slice(0, RECENT_OPENED_MEMORY_LIMIT);
  }

  forget(authorityKey: string, resourceId: string): void {
    if (authorityKey !== this.authorityKey) return;
    this.ids = this.ids.filter((id) => id !== resourceId);
  }

  clear(authorityKey: string): void {
    if (authorityKey !== this.authorityKey) return;
    this.ids = [];
  }

  /**
   * Switching account or authenticated session removes old IDs before
   * reading or recording. Losing focus does not wipe this session's history.
   */
  private prepare(authorityKey: string): void {
    if (this.authorityKey !== authorityKey) {
      this.authorityKey = authorityKey;
      this.ids = [];
    }
  }
}

export const mobileSessionRecentResourceOpens = new SessionRecentResourceOpens();
