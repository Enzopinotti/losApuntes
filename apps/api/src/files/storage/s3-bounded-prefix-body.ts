/**
 * Read an S3 Range GET incrementally. A provider/proxy may ignore Range and
 * stream an arbitrarily large HTTP 200/206 body. Calling arrayBuffer() first
 * allocates the entire response before the caller's maximum is enforced.
 *
 * A single provider-supplied chunk may already be large when delivered by
 * fetch; reject it before retaining/copying it, then cancel the stream.
 */
export async function readBoundedS3PrefixBody(
  response: Pick<Response, 'body'>,
  maximumBytes: number,
): Promise<Uint8Array> {
  if (!Number.isSafeInteger(maximumBytes) || maximumBytes < 1) {
    throw new Error('maximumBytes must be a positive integer');
  }
  if (!response.body) return new Uint8Array();

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  let finished = false;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) {
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
    if (!finished) {
      // Never let best-effort cancellation replace the real transport,
      // invalid-chunk or over-budget error.
      await reader.cancel().catch(() => undefined);
    }
    reader.releaseLock();
  }
}
