import { createHash } from 'node:crypto';

/**
 * A bounded diagnostic guard for the PRIVATE export object stream.
 * Streaming checks can terminate a corrupt response, but cannot retract
 * already sent bytes. Production storage integrity still requires provider
 * readback and controlled object lifecycle.
 */
export async function* verifyAccountExportDownload(
  chunks: AsyncIterable<Uint8Array>,
  expectedByteLength: number,
  expectedSha256: string,
  signal?: AbortSignal,
): AsyncIterable<Uint8Array> {
  if (
    !Number.isSafeInteger(expectedByteLength) ||
    expectedByteLength < 1 ||
    !/^[a-f0-9]{64}$/u.test(expectedSha256)
  ) {
    throw new Error('Account export download integrity metadata is invalid');
  }

  const hash = createHash('sha256');
  let receivedBytes = 0;
  for await (const chunk of chunks) {
    if (signal?.aborted) {
      throw new Error('Account export download was cancelled');
    }
    if (!(chunk instanceof Uint8Array)) {
      throw new Error('Account export download returned an invalid chunk');
    }
    if (chunk.byteLength > expectedByteLength - receivedBytes) {
      // Check before yielding so an oversized object is never emitted
      // beyond the owner-authorized content-length.
      throw new Error('Account export download exceeds its committed length');
    }
    hash.update(chunk);
    receivedBytes += chunk.byteLength;
    yield chunk;
  }
  if (signal?.aborted) {
    throw new Error('Account export download was cancelled');
  }
  if (
    receivedBytes !== expectedByteLength ||
    hash.digest('hex') !== expectedSha256
  ) {
    // A digest mismatch is detected at EOF; HTTP consumers must treat a
    // failed stream as incomplete rather than accepting the attachment.
    throw new Error('Account export download integrity check failed');
  }
}
