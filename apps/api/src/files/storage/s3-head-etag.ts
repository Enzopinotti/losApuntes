import { normalizeS3MultipartPartEtag } from './s3-multipart-part-etag';

/**
 * B119: The ETag returned by S3 HEAD can be persisted with staged file
 * metadata. A missing ETag remains optional for compatible providers, but
 * a PRESENT malformed header is not silently repaired or trusted.
 *
 * Share B108's bounded, balanced-quote, ASCII-printable token contract
 * rather than stripping leading/trailing quotes independently.
 */
export function normalizeS3HeadObjectEtag(raw: string | null): string | null {
  if (raw === null) return null;
  // B108 trims padded tokens for multipart compatibility. For HEAD metadata,
  // reject non-ASCII even if it would be stripped by trim() (e.g. trailing
  // NBSP) so malformed provider bytes are never silently normalized.
  if (!/^[\x20-\x7e]+$/u.test(raw)) {
    throw new Error('S3 HEAD returned an invalid ETag');
  }
  const normalized = normalizeS3MultipartPartEtag(raw);
  if (normalized === null) {
    throw new Error('S3 HEAD returned an invalid ETag');
  }
  return normalized;
}
