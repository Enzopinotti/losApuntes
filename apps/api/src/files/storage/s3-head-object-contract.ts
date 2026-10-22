/**
 * B116: A HEAD response confirms a complete S3 object's metadata only
 * with HTTP 200. Other 2xx statuses are not proof that an object exists
 * with the declared size (for example, 202 Accepted or 206 Partial Content).
 */
export function isConfirmedS3HeadObject(status: number): boolean {
  return status === 200;
}

/**
 * Parse the Content-Length of an acknowledged HEAD without Number()'s
 * permissive coercions (empty string, exponent, decimal, leading zeros).
 * The byte count is used by finalize, so ambiguous values fail closed.
 */
export function parseS3HeadObjectByteSize(raw: string | null): number {
  if (raw === null || !/^(0|[1-9][0-9]*)$/u.test(raw)) {
    throw new Error('S3 HEAD returned an invalid content length');
  }
  const bytes = Number(raw);
  if (!Number.isSafeInteger(bytes) || bytes < 0) {
    throw new Error('S3 HEAD returned an invalid content length');
  }
  return bytes;
}
