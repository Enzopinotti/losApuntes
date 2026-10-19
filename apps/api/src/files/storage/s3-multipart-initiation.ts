/**
 * Extract only a confirmed UploadId from a bounded S3 multipart-initiation XML
 * response. A 2xx response or a regex match anywhere inside arbitrary HTML
 * is not authority to issue part PUTs to that upload generation.
 */
function decodeXmlScalar(value: string): string | null {
  if (value.includes(']]>')) return null;
  const entity = /&(?:amp|lt|gt|quot|apos|#[0-9]+|#x[0-9A-Fa-f]+);/gu;
  if (value.replace(entity, '').includes('&')) return null;
  const decoded = value.replace(entity, (token) => {
    switch (token) {
      case '&amp;':
        return '&';
      case '&lt;':
        return '<';
      case '&gt;':
        return '>';
      case '&quot;':
        return '"';
      case '&apos;':
        return "'";
      default: {
        const hex = token.startsWith('&#x');
        const numeric = token.slice(hex ? 3 : 2, -1);
        const point = Number.parseInt(numeric, hex ? 16 : 10);
        if (
          !Number.isSafeInteger(point) ||
          point > 0x10ffff ||
          (point >= 0xd800 && point <= 0xdfff) ||
          (point < 32 && ![9, 10, 13].includes(point)) ||
          point === 0xfffe ||
          point === 0xffff
        )
          return '\u0000';
        return String.fromCodePoint(point);
      }
    }
  });
  // Match forbidden XML scalar controls by code point, without a control regexp.
  for (const character of decoded) {
    const point = character.codePointAt(0);
    if (
      point !== undefined &&
      (point <= 8 || point === 11 || point === 12 ||
        (point >= 14 && point <= 31) || point === 127 ||
        point === 0xfffe || point === 0xffff)
    ) return null;
  }
  // Reject broken UTF-16 even if the provider returned valid UTF-8 originally.
  for (let i = 0; i < decoded.length; i += 1) {
    const point = decoded.charCodeAt(i);
    if (point >= 0xd800 && point <= 0xdbff) {
      const next = decoded.charCodeAt(++i);
      if (!(next >= 0xdc00 && next <= 0xdfff)) return null;
    } else if (point >= 0xdc00 && point <= 0xdfff) return null;
  }
  return decoded;
}

/** Null means unconfirmed initiation; never persist or sign an invalid ID. */
export function parseConfirmedS3MultipartUploadId(
  xml: string,
  expected?: { bucket: string; objectKey: string },
): string | null {
  if (typeof xml !== 'string' || xml.length === 0 || xml.length > 64 * 1024) {
    return null;
  }
  const body = xml
    .replace(/^\uFEFF/u, '')
    .trim()
    .replace(/^<\?xml\s+[^<>]*\?>\s*/u, '');
  const root =
    /^<InitiateMultipartUploadResult(?:\s+xmlns=(["'])http:\/\/s3\.amazonaws\.com\/doc\/2006-03-01\/\1)?\s*>([\s\S]*)<\/InitiateMultipartUploadResult>$/u.exec(
      body,
    );
  if (!root) return null;
  const inside = root[2];
  const fields = /<(Bucket|Key|UploadId)>([^<]*)<\/\1>/gu;
  const seen = new Set<string>();
  let uploadId: string | null = null;
  let responseBucket: string | null = null;
  let responseKey: string | null = null;
  let cursor = 0;
  for (const match of inside.matchAll(fields)) {
    if (inside.slice(cursor, match.index).trim()) return null;
    const name = match[1];
    if (seen.has(name)) return null;
    seen.add(name);
    const text = decodeXmlScalar(match[2]);
    if (text === null) return null;
    if (name === 'UploadId') uploadId = text;
    if (name === 'Bucket') responseBucket = text;
    if (name === 'Key') responseKey = text;
    cursor = match.index + match[0].length;
  }
  if (
    inside.slice(cursor).trim() ||
    !uploadId ||
    uploadId.length > 2048 ||
    /[\s\u007f]/u.test(uploadId)
  )
    return null;
  if (
    expected &&
    ((responseBucket !== null && responseBucket !== expected.bucket) ||
      (responseKey !== null && responseKey !== expected.objectKey))
  )
    return null;
  return uploadId;
}
