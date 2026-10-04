export class ResourcePickedFileLease {
  private releasePromise: Promise<void> | null = null;

  constructor(
    private readonly uri: string,
    private readonly ownsTemporaryCopy: boolean,
    private readonly deleteTemporaryCopy: (uri: string) => void,
  ) {}

  releaseAfter(pendingWork?: PromiseLike<unknown>): Promise<void> {
    if (this.releasePromise) return this.releasePromise;

    this.releasePromise = Promise.resolve(pendingWork)
      .catch(() => undefined)
      .then(() => {
        if (this.ownsTemporaryCopy) this.deleteTemporaryCopy(this.uri);
      });

    return this.releasePromise;
  }
}
