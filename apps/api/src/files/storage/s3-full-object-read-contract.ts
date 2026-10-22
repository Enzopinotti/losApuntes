/**
 * A full-object S3 GET must return HTTP 200. A 206 response can contain
 * perfectly valid bytes while representing only a remote subrange.
 * Do not allow downstream integrity checks/scanners to see it as an object.
 */
export function isConfirmedS3FullObjectGet(status: number): boolean {
  return status === 200;
}

/**
 * Cancelling a reader must never turn a partial stream into a successful EOF.
 * The caller's AbortSignal is authoritative even if ReadableStream.read()
 * resolves with {done:true} after reader.cancel().
 */
export function assertS3FullObjectReadActive(
  signal: AbortSignal | undefined,
): void {
  if (signal?.aborted) {
    throw new DOMException('S3 GET object was aborted', 'AbortError');
  }
}
