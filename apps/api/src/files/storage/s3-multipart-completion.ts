/**
 * S3 may return HTTP 200 to CompleteMultipartUpload while embedding an
 * XML <Error>. Equally, an empty or unrelated 2xx body is *not* evidence
 * that a multipart generation committed. Fail closed on all ambiguity.
 *
 * This deliberately checks an expected S3 response envelope, without
 * attempting a general-purpose XML parser or trusting body content alone
 * to authorize publishing a private artifact. B90 readback still applies.
 */
export function isConfirmedS3MultipartCompletion(xml: string): boolean {
  if (
    typeof xml !== 'string' ||
    xml.length === 0 ||
    xml.length > 64 * 1024
  ) {
    return false;
  }

  const body = xml.replace(/^\uFEFF/u, '').trim()
    .replace(/^<\?xml\s+[^<>]*\?>\s*/u, '');

  if (!body) return false;
  // The ordinary AWS S3 embedded-error envelope, even in HTTP 200.
  // Match prefixed error tags used by certain S3-compatible services.
  if (/<(?:[A-Za-z_][\w.-]*:)?Error(?:\s|>|\/)/u.test(body)) return false;

  // Accept S3's expected root (with optional default xmlns attributes)
  // and the self-closing representation used by some S3 simulators.
  const opening =
    /^<CompleteMultipartUploadResult(?:\\s+[^<>]*?)?\\s*(?:\\/>|>)/u;
  const match = opening.exec(body);
  if (!match) return false;

  if (match[0].endsWith('/>')) return match[0].length === body.length;

  const closing = '</' + root + '>';
  if (!body.endsWith(closing)) return false;
  // Require exactly one outer completion envelope and no extra sibling
  // XML documents. Nested tags from the provider are allowed.
  const interior = body.slice(match[0].length, -closing.length);
  if (/<\/?CompleteMultipartUploadResult(?:\s|>|\/)/u.test(interior)) {
    return false;
  }
  return true;
}
