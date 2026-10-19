/**
 * B110: every extra header on server-side HEAD/GET/DELETE requests must be
 * covered by AWS SigV4. In particular, Range cannot be sent unsigned.
 * Keep this dependency-free so the canonicalization can be tested in Node.
 */
export function collectS3SignedRequestHeaders(
  host: string,
  contentSha256: string,
  amzDate: string,
  additional: Readonly<Record<string, string>> = {},
): Map<string, string> {
  const signed = new Map<string, string>([
    ['host', host],
    ['x-amz-content-sha256', contentSha256],
    ['x-amz-date', amzDate],
  ]);
  for (const [name, value] of Object.entries(additional)) {
    const normalizedName = name.toLowerCase();
    if (
      !/^[a-z0-9-]+$/u.test(normalizedName) ||
      signed.has(normalizedName) ||
      normalizedName === 'authorization' ||
      typeof value !== 'string' ||
      value.includes('\r') ||
      value.includes('\n') ||
      value.includes('\0')
    ) {
      throw new Error(
        'S3 signed request contains an invalid or reserved header',
      );
    }
    // Match SigV4 canonical whitespace normalization. A duplicate header
    // under another casing must not silently overwrite signed metadata.
    signed.set(normalizedName, value.trim().replace(/\s+/gu, ' '));
  }
  return signed;
}
