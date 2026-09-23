import { createHash, createHmac } from 'node:crypto';

import type {
  ObjectStorage,
  ObjectStorageDownloadIntent,
  ObjectStorageHead,
  ObjectStorageUploadIntent,
} from './object-storage';

const SERVICE = 's3';
const ALGORITHM = 'AWS4-HMAC-SHA256';
const EMPTY_SHA256 = createHash('sha256').update('').digest('hex');
const REQUEST_TIMEOUT_MS = 30_000;

export interface S3ObjectStorageOptions {
  bucket: string;
  region: string;
  accessKeyId: string;
  secretAccessKey: string;
  endpoint: string;
  publicEndpoint?: string;
  providerId?: string;
}

function sha256Hex(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

function hmac(
  key: Buffer | string,
  value: string,
  encoding?: 'hex',
): Buffer | string {
  const digest = createHmac('sha256', key).update(value).digest();
  return encoding === 'hex' ? digest.toString('hex') : digest;
}

function signingKey(
  secretAccessKey: string,
  dateStamp: string,
  region: string,
): Buffer {
  const date = hmac(`AWS4${secretAccessKey}`, dateStamp) as Buffer;
  const regionKey = hmac(date, region) as Buffer;
  const serviceKey = hmac(regionKey, SERVICE) as Buffer;
  return hmac(serviceKey, 'aws4_request') as Buffer;
}

function awsDate(date: Date): { amzDate: string; dateStamp: string } {
  const amzDate = date
    .toISOString()
    .replace(/[:-]/gu, '')
    .replace(/\.\d{3}/u, '');
  return { amzDate, dateStamp: amzDate.slice(0, 8) };
}

function encodeAws(value: string): string {
  return encodeURIComponent(value).replace(
    /[!'()*]/gu,
    (character) => `%${character.charCodeAt(0).toString(16).toUpperCase()}`,
  );
}

function canonicalUri(bucket: string, objectKey: string): string {
  const bucketSegment = encodeAws(bucket);
  const keySegments = objectKey.split('/').map(encodeAws).join('/');
  return `/${bucketSegment}/${keySegments}`;
}

function normalizeHeaderValue(value: string): string {
  return value.trim().replace(/\s+/gu, ' ');
}

function canonicalQuery(
  values: ReadonlyArray<readonly [string, string]>,
): string {
  return values
    .map(([key, value]) => [encodeAws(key), encodeAws(value)] as const)
    .sort(([leftKey, leftValue], [rightKey, rightValue]) => {
      const keyOrder = leftKey.localeCompare(rightKey);
      return keyOrder === 0 ? leftValue.localeCompare(rightValue) : keyOrder;
    })
    .map(([key, value]) => `${key}=${value}`)
    .join('&');
}

function endpointOrigin(raw: string, key: string): URL {
  let url: URL;

  try {
    url = new URL(raw);
  } catch {
    throw new Error(`${key} must be an absolute HTTP(S) URL`);
  }

  if (
    !['http:', 'https:'].includes(url.protocol) ||
    url.username ||
    url.password ||
    (url.pathname !== '/' && url.pathname !== '') ||
    url.search ||
    url.hash
  ) {
    throw new Error(`${key} must be an HTTP(S) root origin`);
  }

  url.pathname = '/';
  return url;
}

function responseDisposition(
  disposition: 'inline' | 'attachment',
  filename: string,
): string {
  const ascii =
    filename
      .normalize('NFKD')
      .replace(/[^\x20-\x7e]/gu, '_')
      .replace(/["\\]/gu, '_')
      .slice(0, 180) || 'download';
  const encoded = encodeURIComponent(filename).replace(
    /['()*]/gu,
    (character) => `%${character.charCodeAt(0).toString(16).toUpperCase()}`,
  );

  return `${disposition}; filename="${ascii}"; filename*=UTF-8''${encoded}`;
}

function presignedUrl(input: {
  method: 'PUT' | 'GET';
  endpoint: URL;
  bucket: string;
  objectKey: string;
  region: string;
  accessKeyId: string;
  secretAccessKey: string;
  expiresInSeconds: number;
  headers?: Readonly<Record<string, string>>;
  query?: ReadonlyArray<readonly [string, string]>;
  now?: Date;
}): string {
  if (
    !Number.isSafeInteger(input.expiresInSeconds) ||
    input.expiresInSeconds < 1 ||
    input.expiresInSeconds > 3600
  ) {
    throw new Error('S3 presign expiry must be between 1 and 3600 seconds');
  }

  const now = input.now ?? new Date();
  const { amzDate, dateStamp } = awsDate(now);
  const scope = `${dateStamp}/${input.region}/${SERVICE}/aws4_request`;
  const headers = new Map<string, string>([
    ['host', input.endpoint.host],
    ...Object.entries(input.headers ?? {}).map(
      ([key, value]) =>
        [key.toLowerCase(), normalizeHeaderValue(value)] as const,
    ),
  ]);
  const signedHeaders = [...headers.keys()].sort().join(';');
  const canonicalHeaders = [...headers.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, value]) => `${key}:${normalizeHeaderValue(value)}\n`)
    .join('');

  const query = [
    ...(input.query ?? []),
    ['X-Amz-Algorithm', ALGORITHM],
    ['X-Amz-Credential', `${input.accessKeyId}/${scope}`],
    ['X-Amz-Date', amzDate],
    ['X-Amz-Expires', String(input.expiresInSeconds)],
    ['X-Amz-SignedHeaders', signedHeaders],
  ] as Array<readonly [string, string]>;

  const canonical = [
    input.method,
    canonicalUri(input.bucket, input.objectKey),
    canonicalQuery(query),
    canonicalHeaders,
    signedHeaders,
    'UNSIGNED-PAYLOAD',
  ].join('\n');
  const stringToSign = [ALGORITHM, amzDate, scope, sha256Hex(canonical)].join(
    '\n',
  );
  const signature = hmac(
    signingKey(input.secretAccessKey, dateStamp, input.region),
    stringToSign,
    'hex',
  ) as string;

  return `${input.endpoint.origin}${canonicalUri(
    input.bucket,
    input.objectKey,
  )}?${canonicalQuery([...query, ['X-Amz-Signature', signature]])}`;
}

async function signedRequest(input: {
  method: 'HEAD' | 'GET' | 'DELETE';
  endpoint: URL;
  bucket: string;
  objectKey: string;
  region: string;
  accessKeyId: string;
  secretAccessKey: string;
  headers?: Readonly<Record<string, string>>;
}): Promise<Response> {
  const now = new Date();
  const { amzDate, dateStamp } = awsDate(now);
  const scope = `${dateStamp}/${input.region}/${SERVICE}/aws4_request`;
  const signingHeaders = new Map<string, string>([
    ['host', input.endpoint.host],
    ['x-amz-content-sha256', EMPTY_SHA256],
    ['x-amz-date', amzDate],
  ]);
  const signedHeaders = [...signingHeaders.keys()].sort().join(';');
  const canonicalHeaders = [...signingHeaders.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, value]) => `${key}:${value}\n`)
    .join('');

  const canonical = [
    input.method,
    canonicalUri(input.bucket, input.objectKey),
    '',
    canonicalHeaders,
    signedHeaders,
    EMPTY_SHA256,
  ].join('\n');
  const stringToSign = [ALGORITHM, amzDate, scope, sha256Hex(canonical)].join(
    '\n',
  );
  const signature = hmac(
    signingKey(input.secretAccessKey, dateStamp, input.region),
    stringToSign,
    'hex',
  ) as string;
  const authorization =
    `${ALGORITHM} Credential=${input.accessKeyId}/${scope}, ` +
    `SignedHeaders=${signedHeaders}, Signature=${signature}`;

  return fetch(
    `${input.endpoint.origin}${canonicalUri(input.bucket, input.objectKey)}`,
    {
      method: input.method,
      headers: {
        'x-amz-content-sha256': EMPTY_SHA256,
        'x-amz-date': amzDate,
        authorization,
        ...(input.headers ?? {}),
      },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    },
  );
}

function storageError(operation: string, status: number): Error {
  return new Error(`S3 ${operation} failed with HTTP ${status}`);
}

export function createS3ObjectStorage(
  options: S3ObjectStorageOptions,
): ObjectStorage {
  const endpoint = endpointOrigin(options.endpoint, 'FILES_S3_ENDPOINT');
  const publicEndpoint = endpointOrigin(
    options.publicEndpoint ?? options.endpoint,
    'FILES_S3_PUBLIC_ENDPOINT',
  );
  const providerId = options.providerId ?? 's3';

  return Object.freeze({
    providerId,

    createUploadIntent(
      input: Parameters<ObjectStorage['createUploadIntent']>[0],
    ): Promise<ObjectStorageUploadIntent> {
      const url = presignedUrl({
        method: 'PUT',
        endpoint: publicEndpoint,
        bucket: options.bucket,
        objectKey: input.objectKey,
        region: options.region,
        accessKeyId: options.accessKeyId,
        secretAccessKey: options.secretAccessKey,
        expiresInSeconds: input.expiresInSeconds,
        headers: {
          'content-type': input.contentType,
          'if-none-match': '*',
        },
      });

      return Promise.resolve({
        url,
        method: 'PUT',
        headers: {
          'content-type': input.contentType,
          'if-none-match': '*',
        },
        expiresAt: new Date(Date.now() + input.expiresInSeconds * 1000),
      });
    },

    async headObject(objectKey: string): Promise<ObjectStorageHead | null> {
      const response = await signedRequest({
        method: 'HEAD',
        endpoint,
        bucket: options.bucket,
        objectKey,
        region: options.region,
        accessKeyId: options.accessKeyId,
        secretAccessKey: options.secretAccessKey,
      });

      if (response.status === 404) return null;
      if (!response.ok) throw storageError('HEAD', response.status);

      const rawLength = response.headers.get('content-length');
      const byteSize = rawLength === null ? Number.NaN : Number(rawLength);

      if (!Number.isSafeInteger(byteSize) || byteSize < 0) {
        throw new Error('S3 HEAD returned an invalid content length');
      }

      return {
        byteSize,
        contentType: response.headers.get('content-type'),
        etag: response.headers.get('etag')?.replace(/^"|"$/gu, '') ?? null,
      };
    },

    async readPrefix(
      objectKey: string,
      maximumBytes: number,
    ): Promise<Uint8Array> {
      if (!Number.isSafeInteger(maximumBytes) || maximumBytes < 1) {
        throw new Error('maximumBytes must be a positive integer');
      }

      const response = await signedRequest({
        method: 'GET',
        endpoint,
        bucket: options.bucket,
        objectKey,
        region: options.region,
        accessKeyId: options.accessKeyId,
        secretAccessKey: options.secretAccessKey,
        headers: {
          range: `bytes=0-${maximumBytes - 1}`,
        },
      });

      if (!response.ok) throw storageError('GET prefix', response.status);
      const bytes = new Uint8Array(await response.arrayBuffer());

      if (bytes.byteLength > maximumBytes) {
        throw new Error('S3 returned more bytes than the requested prefix');
      }

      return bytes;
    },

    createDownloadIntent(
      input: Parameters<ObjectStorage['createDownloadIntent']>[0],
    ): Promise<ObjectStorageDownloadIntent> {
      const url = presignedUrl({
        method: 'GET',
        endpoint: publicEndpoint,
        bucket: options.bucket,
        objectKey: input.objectKey,
        region: options.region,
        accessKeyId: options.accessKeyId,
        secretAccessKey: options.secretAccessKey,
        expiresInSeconds: input.expiresInSeconds,
        query: [
          ['response-content-type', input.contentType],
          [
            'response-content-disposition',
            responseDisposition(input.disposition, input.filename),
          ],
        ],
      });

      return Promise.resolve({
        url,
        expiresAt: new Date(Date.now() + input.expiresInSeconds * 1000),
      });
    },

    async deleteObject(objectKey: string): Promise<void> {
      const response = await signedRequest({
        method: 'DELETE',
        endpoint,
        bucket: options.bucket,
        objectKey,
        region: options.region,
        accessKeyId: options.accessKeyId,
        secretAccessKey: options.secretAccessKey,
      });

      if (response.status === 404) return;
      if (!response.ok) throw storageError('DELETE', response.status);
    },
  });
}
