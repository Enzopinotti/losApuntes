import { createHash, createHmac, timingSafeEqual } from 'node:crypto';

/**
 * Test-only independent verifier for signed requests received by the B86
 * loopback server. It deliberately does NOT import the app's signer.
 *
 * A fake S3 service that only checks the Authorization prefix creates
 * false confidence: a corrupted body, forged signature, or redirected key
 * would otherwise make the positive HTTP acceptance green.
 */
const encode = value => encodeURIComponent(value).replace(
  /[!'()*]/gu, char =>
    `%${char.charCodeAt(0).toString(16).toUpperCase()}`,
);
const sha = value => createHash('sha256').update(value).digest('hex');
const hmac = (key, value) => createHmac('sha256', key).update(value).digest();
const canonicalQuery = url => [...url.searchParams.entries()]
  .map(([key, value]) => [encode(key), encode(value)])
  .sort(([ka, va], [kb, vb]) =>
    ka < kb ? -1 : ka > kb ? 1 : va < vb ? -1 : va > vb ? 1 : 0)
  .map(([key, value]) => `${key}=${value}`).join('&');

function readHeader(headers, key) {
  const found = Object.entries(headers).filter(
    ([name]) => name.toLowerCase() === key,
  );
  if (found.length !== 1 || typeof found[0][1] !== 'string') return null;
  return found[0][1].trim().replace(/\s+/gu, ' ');
}

function safeEqualHex(left, right) {
  if (!/^[0-9a-f]{64}$/u.test(left) || !/^[0-9a-f]{64}$/u.test(right)) {
    return false;
  }
  return timingSafeEqual(Buffer.from(left, 'hex'), Buffer.from(right, 'hex'));
}

/** Returns false rather than trusting a malformed/partially signed request. */
export function verifyB87S3SigV4({
  method, url, headers, body, bucket, objectKey, region,
  accessKeyId, secretAccessKey, now,
}) {
  try {
    const requestUrl = url instanceof URL ? url : new URL(url);
    const expectedPath =
      `/${encode(bucket)}/${objectKey.split('/').map(encode).join('/')}`;
    if (requestUrl.pathname !== expectedPath ||
      requestUrl.username || requestUrl.password ||
      !['http:', 'https:'].includes(requestUrl.protocol)) return false;
    if (!(now instanceof Date) || !Number.isFinite(now.getTime())) return false;
    if (!(body instanceof Uint8Array)) return false;

    const authorization = readHeader(headers, 'authorization');
    const match = /^AWS4-HMAC-SHA256 Credential=([^, ]+), SignedHeaders=([^, ]+), Signature=([0-9a-f]{64})$/u.exec(
      authorization ?? '',
    );
    if (!match) return false;
    const [, credential, signedList, signature] = match;
    const signedNames = signedList.split(';');
    if (signedNames.some(name => !/^[a-z0-9-]+$/u.test(name)) ||
      new Set(signedNames).size !== signedNames.length ||
      signedNames.join(';') !== [...signedNames].sort().join(';') ||
      !['host', 'x-amz-content-sha256', 'x-amz-date']
        .every(name => signedNames.includes(name))) return false;

    const amzDate = readHeader(headers, 'x-amz-date');
    if (!amzDate || !/^\d{8}T\d{6}Z$/u.test(amzDate)) return false;
    const dateStamp = amzDate.slice(0, 8);
    const parsedTime = Date.parse(
      `${dateStamp.slice(0, 4)}-${dateStamp.slice(4, 6)}-${dateStamp.slice(6, 8)}T${amzDate.slice(9, 11)}:${amzDate.slice(11, 13)}:${amzDate.slice(13, 15)}Z`,
    );
    if (!Number.isFinite(parsedTime) ||
      Math.abs(now.getTime() - parsedTime) > 15 * 60_000) return false;
    if (credential !== `${accessKeyId}/${dateStamp}/${region}/s3/aws4_request`) {
      return false;
    }
    if (readHeader(headers, 'host') !== requestUrl.host) return false;
    const payloadHash = sha(body);
    if (!safeEqualHex(readHeader(headers, 'x-amz-content-sha256') ?? '', payloadHash)) {
      return false;
    }

    const headerLines = signedNames.map(name => {
      const value = readHeader(headers, name);
      return value === null ? null : `${name}:${value}\n`;
    });
    if (headerLines.some(line => line === null)) return false;
    const canonicalRequest = [
      method, expectedPath, canonicalQuery(requestUrl),
      headerLines.join(''), signedList, payloadHash,
    ].join('\n');
    const scope = `${dateStamp}/${region}/s3/aws4_request`;
    const toSign = [
      'AWS4-HMAC-SHA256', amzDate, scope, sha(canonicalRequest),
    ].join('\n');
    const signingKey = hmac(
      hmac(hmac(hmac(`AWS4${secretAccessKey}`, dateStamp), region), 's3'),
      'aws4_request',
    );
    return safeEqualHex(signature, createHmac('sha256', signingKey)
      .update(toSign).digest('hex'));
  } catch {
    return false;
  }
}
