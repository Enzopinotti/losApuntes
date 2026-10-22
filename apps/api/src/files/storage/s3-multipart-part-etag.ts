/**
 * The UploadPart ETag is an HTTP header, not proof of a valid multipart
 * generation. Reject malformed/massive headers before building Complete XML.
 * Compatibility: standard quoted and S3-compatible unquoted opaque tokens.
 */
export function normalizeS3MultipartPartEtag(
  raw: string | null,
): string | null {
  if (
    typeof raw !== 'string' ||
    raw.length === 0 ||
    raw.length > 256 ||
    [...raw].some((char) => {
      const point = char.charCodeAt(0);
      return point <= 31 || point === 127;
    })
  ) {
    return null;
  }
  const value = raw.trim();
  const startsQuote = value.startsWith('"');
  const endsQuote = value.endsWith('"');
  if (startsQuote !== endsQuote) return null;
  const token = startsQuote ? value.slice(1, -1) : value;
  // ETags are opaque printable HTTP tokens. Internal whitespace, embedded
  // quotes and non-ASCII are not valid here, even if XML escaping would
  // prevent markup injection. Leave XML escaping to the caller.
  if (
    !token ||
    token.length > 254 ||
    !/^[\x21-\x7e]+$/u.test(token) ||
    token.includes('"') ||
    token.includes('\\')
  ) {
    return null;
  }
  return token;
}
