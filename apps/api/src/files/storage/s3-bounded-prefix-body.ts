import { expectedS3PrefixBytes } from './s3-prefix-content-range';

/**
 * Read an S3 Range GET incrementally. A provider/proxy may ignore Range and
 * stream an arbitrarily large HTTP 200/206 body. Calling arrayBuffer() first
 * allocates the entire response before the caller's maximum is enforced.
 *
 * A single provider-supplied chunk may already be large when delivered by
 * fetch; reject it before retaining/copying it, then cancel the stream.
 */
export async function readBoundedS3PrefixBody(
  response: Pick<Response, 'body'> &
    Partial<Pick<Response, 'status' | 'headers'>>,
  maximumBytes: number,
): Promise<Uint8Array> {
  if (!Number.isSafeInteger(maximumBytes) || maximumBytes < 1) {
    throw new Error('maximumBytes must be a positive integer');
  }
  const reader = response.body?.getReader();
  // Accept 200 (full object bounded by maximumBytes), but HTTP 206 must
  // identify the exact byte-0 window of the requested prefix.
  // Check inside try so an invalid response cancels the provider body.
  const chunks: Uint8Array[] = [];
  let total = 0;
  let finished = false;
  try {
    const expectedBytes =
      response.status === undefined
        ? null
        : expectedS3PrefixBytes(
            response.status,
            response.headers?.get('content-range') ?? null,
            maximumBytes,
          );
    if (!reader) {
      if (expectedBytes !== null) {
        throw new Error(
          'S3 GET prefix returned a truncated Content-Range body',
        );
      }
      return new Uint8Array();
    }
    while (true) {
      const { value, done } = await reader.read();
      if (done) {
        if (expectedBytes !== null && total !== expectedBytes) {
          throw new Error(
            'S3 GET prefix returned a truncated Content-Range body',
          );
        }
        finished = true;
        break;
      }
      if (!(value instanceof Uint8Array)) {
        throw new Error('S3 prefix response returned invalid bytes');
      }
      if (value.byteLength > maximumBytes - total) {
        throw new Error('S3 returned more bytes than the requested prefix');
      }
      // Ignore empty chunks; they consume no byte budget but must not
      // accumulate unlimited array entries if a provider floods empties.
      if (value.byteLength === 0) continue;
      // Preserve an owned copy of each bounded chunk; the caller cannot
      // depend on the producer keeping its backing buffer unchanged.
      chunks.push(Uint8Array.from(value));
      total += value.byteLength;
    }
    const result = new Uint8Array(total);
    let offset = 0;
    for (const chunk of chunks) {
      result.set(chunk, offset);
      offset += chunk.byteLength;
    }
    return result;
  } finally {
    if (reader) {
      if (!finished) {
        // Never mask the original range, transport or body-length error.
        await reader.cancel().catch(() => undefined);
      }
      reader.releaseLock();
    }
  }
}
