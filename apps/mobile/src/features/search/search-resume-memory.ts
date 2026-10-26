import type { MobileSearchInput } from "./search-api";
import { mobileSearchLinkKey, parseMobileSearchLink } from "./search-deep-link";

/**
 * Keeps only the current search request in process memory for one session.
 * Results, labels, credentials, and URLs are deliberately never retained.
 */
export class MobileSearchResumeMemory {
  private sessionAuthority: string | null = null;
  private input: MobileSearchInput | null = null;
  private readonly listeners = new Set<() => void>();

  setSession(sessionAuthority: string | null): void {
    if (this.sessionAuthority === sessionAuthority) return;
    this.sessionAuthority = sessionAuthority;
    this.input = null;
    this.publish();
  }

  remember(
    sessionAuthority: string | null,
    input: MobileSearchInput | null,
    options: { resumePending?: boolean } = {},
  ): void {
    if (!sessionAuthority || this.sessionAuthority !== sessionAuthority) return;
    if (options.resumePending) return;
    const parsed = input
      ? parseMobileSearchLink({
          q: input.q,
          scope: input.scope,
          subjectId: input.subjectId,
        })
      : null;
    if (!parsed) {
      this.clear(sessionAuthority);
      return;
    }
    if (
      this.input &&
      mobileSearchLinkKey(this.input) === mobileSearchLinkKey(parsed)
    ) {
      return;
    }
    this.input = parsed;
    this.publish();
  }

  get(sessionAuthority: string | null): MobileSearchInput | null {
    if (
      !sessionAuthority ||
      this.sessionAuthority !== sessionAuthority ||
      !this.input
    ) {
      return null;
    }
    return { ...this.input };
  }

  has(sessionAuthority: string | null): boolean {
    return this.get(sessionAuthority) !== null;
  }

  clear(sessionAuthority: string | null): void {
    if (
      !sessionAuthority ||
      this.sessionAuthority !== sessionAuthority ||
      !this.input
    ) {
      return;
    }
    this.input = null;
    this.publish();
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private publish(): void {
    for (const listener of this.listeners) listener();
  }
}

export const mobileSearchResumeMemory = new MobileSearchResumeMemory();
