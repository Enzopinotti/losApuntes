/**
 * B115: HTTP 200 is not enough to confirm that the entire object arrived.
 * A full S3 GET may advertise Content-Length yet end early or deliver bytes
 * beyond that length. Only a naturally reached EOF may complete the stream.
 *
 * Missing Content-Length is accepted for S3-compatible chunked responses;
 * readback SHA256 and higher-level integrity controls remain authoritative.
 */
export function parseS3FullObjectContentLength(
  raw: string | null,
): number | null {
  if (raw === null) return null;
  if (!/^(0|[1-9][0-9]*)$/u.test(raw)) {
    throw new Error('S3 GET object returned an invalid Content-Length');
  }
  const bytes = Number(raw);
  if (!Number.isSafeInteger(bytes) || bytes < 0) {
    throw new Error('S3 GET object returned an invalid Content-Length');
  }
  return bytes;
}

export function assertS3FullObjectContentLength(
  expected: number | null,
  received: number,
  atEndOfStream: boolean,
): void {
  if (!Number.isSafeInteger(received) || received < 0) {
    throw new Error('S3 GET object exceeded declared Content-Length');
  }
  if (expected === null) return;
  if (received > expected) {
    throw new Error('S3 GET object exceeded declared Content-Length');
  }
  if (atEndOfStream && received !== expected) {
    throw new Error('S3 GET object returned a truncated Content-Length body');
  }
}
