/**
 * Validate that a 206 response actually contains the *first* requested
 * bytes, rather than a different window or a truncated range.
 * HTTP 200 is an allowed full-object response when the provider ignores
 * Range; B109 still enforces its byte ceiling while reading.
 */
export function expectedS3PrefixBytes(
  status: number,
  rawContentRange: string | null,
  maximumBytes: number,
): number | null {
  if (!Number.isSafeInteger(maximumBytes) || maximumBytes < 1) {
    throw new Error('maximumBytes must be a positive integer');
  }
  if (status === 200) return null;
  if (status !== 206) {
    throw new Error('S3 GET prefix returned an unexpected successful status');
  }

  const match = /^bytes (0|[1-9][0-9]*)-(0|[1-9][0-9]*)\/([1-9][0-9]*)$/u.exec(
    rawContentRange ?? '',
  );
  if (!match)
    throw new Error('S3 GET prefix returned an invalid Content-Range');
  const start = Number(match[1]);
  const end = Number(match[2]);
  const total = Number(match[3]);
  if (
    ![start, end, total].every(Number.isSafeInteger) ||
    start !== 0 ||
    end >= total ||
    end !== Math.min(maximumBytes, total) - 1
  ) {
    throw new Error('S3 GET prefix returned a mismatched Content-Range');
  }
  return end + 1;
}
