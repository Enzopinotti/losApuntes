export type AdmissionDecision =
  | { admitted: true }
  | { admitted: false; active: number; maximum: number };

export class ApiAdmissionBudget {
  private readonly activeRequestIds = new Set<string>();

  constructor(private readonly maximumInFlight: number) {
    if (
      !Number.isSafeInteger(maximumInFlight) ||
      maximumInFlight < 1 ||
      maximumInFlight > 10_000
    ) {
      throw new Error('maximumInFlight must be an integer between 1 and 10000');
    }
  }

  tryAcquire(requestId: string): AdmissionDecision {
    if (this.activeRequestIds.has(requestId)) {
      return { admitted: true };
    }

    if (this.activeRequestIds.size >= this.maximumInFlight) {
      return {
        admitted: false,
        active: this.activeRequestIds.size,
        maximum: this.maximumInFlight,
      };
    }

    this.activeRequestIds.add(requestId);
    return { admitted: true };
  }

  release(requestId: string): void {
    this.activeRequestIds.delete(requestId);
  }

  active(): number {
    return this.activeRequestIds.size;
  }
}
