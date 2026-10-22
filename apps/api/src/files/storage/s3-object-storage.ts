import { createHash, createHmac } from 'node:crypto';

import { readBoundedS3PrefixBody } from './s3-bounded-prefix-body';
import {
  assertS3FullObjectReadActive,
  isConfirmedS3FullObjectGet,
} from './s3-full-object-read-contract';
import {
  parseS3FullObjectContentLength,
  assertS3FullObjectContentLength,
} from './s3-full-object-length';
import { collectS3SignedRequestHeaders } from './s3-signed-request-headers';
import {
  isConfirmedS3HeadObject,
  parseS3HeadObjectByteSize,
} from './s3-head-object-contract';
import { isConfirmedS3MultipartCompletion } from './s3-multipart-completion';
import { parseConfirmedS3MultipartUploadId } from './s3-multipart-initiation';
import { normalizeS3MultipartPartEtag } from './s3-multipart-part-etag';
import { normalizeS3HeadObjectEtag } from './s3-head-etag';
import {
  isConfirmedS3WriteAcknowledgement,
  isConfirmedS3MultipartAbort,
  isConfirmedS3ObjectDelete,
} from './s3-write-ack-status';
import {
  readBoundedS3MultipartCompletionXml,
  readBoundedS3MultipartInitiationXml,
} from './s3-multipart-response-body';

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
  now?: () => Date;
  configurationPrefix?: string;
}

export interface S3MultipartObjectWriter {
  write(chunk: Uint8Array): Promise<void>;
  complete(): Promise<void>;
  abort(): Promise<void>;
}

export interface S3ObjectStorage extends ObjectStorage {
  readObjectChunks(
    objectKey: string,
    maximumChunkBytes?: number,
    signal?: AbortSignal,
  ): AsyncIterable<Uint8Array>;
  createMultipartWriter(input: {
    objectKey: string;
    contentType: string;
    /**
     * Defaults to true for existing consumers.
     * Private exports pass false: abort the multipart upload ID only, never
     * delete a possibly committed object outside the Mongo owner-fenced
     * orphan queue (B78-B81).
     */
    deleteObjectOnAbort?: boolean;
  }): S3MultipartObjectWriter;
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
      if (leftKey < rightKey) return -1;
      if (leftKey > rightKey) return 1;
      if (leftValue < rightValue) return -1;
      if (leftValue > rightValue) return 1;
      return 0;
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
    .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0))
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
  timeoutMs?: number;
  signal?: AbortSignal;
  now?: Date;
}): Promise<Response> {
  const now = input.now ?? new Date();
  const { amzDate, dateStamp } = awsDate(now);
  const scope = `${dateStamp}/${input.region}/${SERVICE}/aws4_request`;
  // B110: sign Range and all optional request headers in the canonical
  // request. Otherwise a proxy can change a prefix window undetected.
  const signingHeaders = collectS3SignedRequestHeaders(
    input.endpoint.host,
    EMPTY_SHA256,
    amzDate,
    input.headers,
  );
  const signedHeaders = [...signingHeaders.keys()].sort().join(';');
  const canonicalHeaders = [...signingHeaders.entries()]
    .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0))
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
      signal: input.signal
        ? AbortSignal.any([
            AbortSignal.timeout(input.timeoutMs ?? REQUEST_TIMEOUT_MS),
            input.signal,
          ])
        : AbortSignal.timeout(input.timeoutMs ?? REQUEST_TIMEOUT_MS),
    },
  );
}

async function signedBodyRequest(input: {
  method: 'POST' | 'PUT' | 'DELETE';
  endpoint: URL;
  bucket: string;
  objectKey: string;
  region: string;
  accessKeyId: string;
  secretAccessKey: string;
  query?: ReadonlyArray<readonly [string, string]>;
  headers?: Readonly<Record<string, string>>;
  body?: Uint8Array;
  timeoutMs?: number;
  now?: Date;
}): Promise<Response> {
  const now = input.now ?? new Date();
  const { amzDate, dateStamp } = awsDate(now);
  const scope = `${dateStamp}/${input.region}/${SERVICE}/aws4_request`;
  const body = input.body ?? new Uint8Array();
  const payloadHash = createHash('sha256').update(body).digest('hex');
  // B112: multipart POST/PUT/DELETE must enforce the same reserved-header
  // ownership as B110 GET/HEAD. A supplied content-type is signed, but it
  // must never overwrite host, payload hash, date or authorization.
  const headers = collectS3SignedRequestHeaders(
    input.endpoint.host,
    payloadHash,
    amzDate,
    input.headers,
  );
  const signedHeaders = [...headers.keys()].sort().join(';');
  const canonicalHeaders = [...headers.entries()]
    .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0))
    .map(([key, value]) => `${key}:${normalizeHeaderValue(value)}\n`)
    .join('');
  const query = canonicalQuery(input.query ?? []);
  const canonical = [
    input.method,
    canonicalUri(input.bucket, input.objectKey),
    query,
    canonicalHeaders,
    signedHeaders,
    payloadHash,
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
  const url = `${input.endpoint.origin}${canonicalUri(
    input.bucket,
    input.objectKey,
  )}${query ? `?${query}` : ''}`;

  return fetch(url, {
    method: input.method,
    headers: {
      ...Object.fromEntries(headers),
      authorization,
    },
    ...(body.byteLength > 0 ? { body: Buffer.from(body) } : {}),
    signal: AbortSignal.timeout(input.timeoutMs ?? REQUEST_TIMEOUT_MS),
  });
}

function storageError(operation: string, status: number): Error {
  return new Error(`S3 ${operation} failed with HTTP ${status}`);
}

function xmlEscape(value: string): string {
  return value
    .replace(/&/gu, '&amp;')
    .replace(/</gu, '&lt;')
    .replace(/>/gu, '&gt;')
    .replace(/"/gu, '&quot;')
    .replace(/'/gu, '&apos;');
}

export function createS3ObjectStorage(
  options: S3ObjectStorageOptions,
): S3ObjectStorage {
  const configurationPrefix = options.configurationPrefix ?? 'FILES_S3';
  const endpoint = endpointOrigin(
    options.endpoint,
    `${configurationPrefix}_ENDPOINT`,
  );
  const publicEndpoint = endpointOrigin(
    options.publicEndpoint ?? options.endpoint,
    `${configurationPrefix}_PUBLIC_ENDPOINT`,
  );
  const providerId = options.providerId ?? 's3';
  const deleteObject = async (objectKey: string): Promise<void> => {
    const response = await signedRequest({
      method: 'DELETE',
      endpoint,
      bucket: options.bucket,
      objectKey,
      region: options.region,
      accessKeyId: options.accessKeyId,
      secretAccessKey: options.secretAccessKey,
      now: options.now?.(),
    });

    // B120: a provider may acknowledge 202 while deletion is still
    // asynchronous. Do not retire the owner-fenced cleanup claim until a
    // terminal DELETE result (204/compatible 200/idempotent 404).
    if (!isConfirmedS3ObjectDelete(response.status)) {
      throw storageError('DELETE', response.status);
    }
  };

  return Object.freeze({
    providerId,

    createMultipartWriter(input: {
      objectKey: string;
      contentType: string;
      deleteObjectOnAbort?: boolean;
    }): S3MultipartObjectWriter {
      const minimumPartBytes = 5 * 1024 * 1024;
      const maximumPartCount = 10_000;
      const pending: Buffer[] = [];
      const parts: Array<{ partNumber: number; etag: string }> = [];
      let pendingBytes = 0;
      let uploadId: string | null = null;
      let completed = false;
      let aborted = false;
      // B104: a failed PUT/ACK may have persisted an unknown subset of parts.
      // Never allow complete() to publish after a failed write or ambiguous
      // completion. Only abort() may act on the retained multipart upload ID.
      let failed = false;

      const request = (
        method: 'POST' | 'PUT' | 'DELETE',
        query?: ReadonlyArray<readonly [string, string]>,
        body?: Uint8Array,
        contentType?: string,
      ) =>
        signedBodyRequest({
          method,
          endpoint,
          bucket: options.bucket,
          objectKey: input.objectKey,
          region: options.region,
          accessKeyId: options.accessKeyId,
          secretAccessKey: options.secretAccessKey,
          query,
          headers: contentType ? { 'content-type': contentType } : undefined,
          body,
          now: options.now?.(),
        });

      const start = async () => {
        const response = await request(
          'POST',
          [['uploads', '']],
          undefined,
          input.contentType,
        );
        if (!isConfirmedS3WriteAcknowledgement(response.status)) {
          void response.body?.cancel().catch(() => undefined);
          throw storageError('Create multipart upload', response.status);
        }
        // A 2xx initiation response must not be buffered without a limit or
        // treated as proof of a valid upload generation without parsing.
        const xml = await readBoundedS3MultipartInitiationXml(response);
        const confirmedUploadId = parseConfirmedS3MultipartUploadId(xml, {
          bucket: options.bucket,
          objectKey: input.objectKey,
        });
        if (!confirmedUploadId) {
          throw new Error('S3 multipart upload id is missing or invalid');
        }
        uploadId = confirmedUploadId;
      };

      const uploadPart = async (bytes: Buffer) => {
        if (!uploadId) await start();
        const currentUploadId = uploadId;
        if (!currentUploadId) throw new Error('S3 multipart upload is missing');
        const partNumber = parts.length + 1;
        if (partNumber > maximumPartCount) {
          throw new Error('S3 multipart upload exceeds the maximum part count');
        }
        const response = await request(
          'PUT',
          [
            ['partNumber', String(partNumber)],
            ['uploadId', currentUploadId],
          ],
          bytes,
          'application/octet-stream',
        );
        if (!isConfirmedS3WriteAcknowledgement(response.status)) {
          void response.body?.cancel().catch(() => undefined);
          throw storageError('Upload multipart part', response.status);
        }
        const etag = normalizeS3MultipartPartEtag(response.headers.get('etag'));
        if (!etag) {
          throw new Error('S3 multipart part returned an invalid ETag');
        }
        parts.push({
          partNumber,
          etag: `"${xmlEscape(etag)}"`,
        });
      };

      const flushPending = async () => {
        if (pendingBytes === 0) return;
        const bytes = Buffer.concat(pending, pendingBytes);
        pending.length = 0;
        pendingBytes = 0;
        await uploadPart(bytes);
      };

      const underlyingWriter: S3MultipartObjectWriter = {
        async write(chunk: Uint8Array): Promise<void> {
          if (completed || aborted || failed) {
            throw new Error('S3 multipart writer is no longer writable');
          }
          try {
            let offset = 0;
            while (offset < chunk.byteLength) {
              const take = Math.min(
                minimumPartBytes - pendingBytes,
                chunk.byteLength - offset,
              );
              pending.push(Buffer.from(chunk.subarray(offset, offset + take)));
              pendingBytes += take;
              offset += take;
              if (pendingBytes === minimumPartBytes) await flushPending();
            }
          } catch (error) {
            // flushPending() already drained local bytes before awaiting S3;
            // their commit/ACK status is unknown, so never retry this writer.
            failed = true;
            throw error;
          }
        },

        async complete(): Promise<void> {
          if (aborted) throw new Error('S3 multipart writer was aborted');
          if (failed) {
            throw new Error(
              'S3 multipart writer cannot complete after a failed operation',
            );
          }
          if (completed) return;
          try {
            if (!uploadId) {
              const bytes = Buffer.concat(pending, pendingBytes);
              const response = await request(
                'PUT',
                undefined,
                bytes,
                input.contentType,
              );
              if (!isConfirmedS3WriteAcknowledgement(response.status)) {
                void response.body?.cancel().catch(() => undefined);
                throw storageError('PUT object', response.status);
              }
              completed = true;
              return;
            }

            await flushPending();
            if (parts.length === 0) {
              throw new Error('S3 multipart upload has no parts');
            }
            const currentUploadId = uploadId;
            const body = Buffer.from(
              `<CompleteMultipartUpload>${parts
                .map(
                  ({ partNumber, etag }) =>
                    `<Part><PartNumber>${partNumber}</PartNumber><ETag>${etag}</ETag></Part>`,
                )
                .join('')}</CompleteMultipartUpload>`,
              'utf8',
            );
            const response = await request(
              'POST',
              [['uploadId', currentUploadId]],
              body,
              'application/xml',
            );
            // Never buffer an unlimited 200 response before B96's semantic
            // check: a malicious/broken provider might stream indefinitely.
            // Keep the uploadId when completion is ambiguous. In the private
            // export path, abort() can only target that multipart ID.
            if (!isConfirmedS3WriteAcknowledgement(response.status)) {
              void response.body?.cancel().catch(() => undefined);
              throw storageError('Complete multipart upload', response.status);
            }
            const xml = await readBoundedS3MultipartCompletionXml(response);
            if (
              !isConfirmedS3MultipartCompletion(xml, {
                bucket: options.bucket,
                objectKey: input.objectKey,
              })
            ) {
              throw storageError('Complete multipart upload', response.status);
            }
            uploadId = null;
            completed = true;
          } catch (error) {
            // An incomplete/ambiguous provider response cannot be repaired by
            // resubmitting complete(), which might commit a partial object.
            failed = true;
            throw error;
          }
        },

        async abort(): Promise<void> {
          if (aborted) return;
          const currentUploadId = uploadId;
          if (currentUploadId) {
            const response = await request('DELETE', [
              ['uploadId', currentUploadId],
            ]);
            if (!isConfirmedS3MultipartAbort(response.status)) {
              void response.body?.cancel().catch(() => undefined);
              throw storageError('Abort multipart upload', response.status);
            }
          }
          // Multipart Abort only cancels the upload ID. An ambiguous
          // completion ACK can mean the object already exists in S3.
          // Private account exports pre-register a durable cleanup task
          // and must never perform this unfenced exact-object DELETE.
          if (input.deleteObjectOnAbort !== false) {
            await deleteObject(input.objectKey);
          }
          aborted = true;
          uploadId = null;
          completed = false;
        },
      };

      // B105: serialize *all* operations on this writer. B104's terminal
      // failure flag does not prevent two simultaneous write() calls from
      // reusing a part number, nor complete() overtaking a pending part ACK.
      // A rejected operation must not poison the queue: abort() still runs.
      let pendingOperation: Promise<void> = Promise.resolve();
      let completionRequested = false;
      let abortRequested = false;
      // B106 bounds snapshots accepted while the provider is stalled.
      // It includes both queued and currently executing write() calls.
      const maximumQueuedSnapshotBytes = 16 * 1024 * 1024;
      const maximumQueuedWriteOperations = 32;
      let queuedSnapshotBytes = 0;
      let queuedWriteOperations = 0;
      const serialize = (operation: () => Promise<void>): Promise<void> => {
        const result = pendingOperation.then(operation);
        pendingOperation = result.then(
          () => undefined,
          () => undefined,
        );
        return result;
      };

      return {
        write(chunk: Uint8Array): Promise<void> {
          if (
            completionRequested ||
            abortRequested ||
            completed ||
            aborted ||
            failed
          ) {
            return Promise.reject(
              new Error('S3 multipart writer is no longer writable'),
            );
          }
          // Fail closed if backpressure is ignored. Rejection must poison
          // this generation: otherwise complete() could commit only the
          // previously accepted chunks after the caller drops the error.
          if (
            chunk.byteLength >
              maximumQueuedSnapshotBytes - queuedSnapshotBytes ||
            queuedWriteOperations >= maximumQueuedWriteOperations
          ) {
            failed = true;
            return Promise.reject(
              new Error('S3 multipart writer pending writes exceed limits'),
            );
          }
          // Snapshots must own their bytes while another signed PUT awaits an
          // ACK. The counters include the active write as well as queued ones.
          let snapshot: Buffer;
          try {
            snapshot = Buffer.from(chunk);
          } catch (error) {
            failed = true;
            return Promise.reject(
              error instanceof Error
                ? error
                : new Error('S3 multipart chunk could not be copied', {
                    cause: error,
                  }),
            );
          }
          queuedSnapshotBytes += snapshot.byteLength;
          queuedWriteOperations += 1;
          return serialize(async () => {
            try {
              await underlyingWriter.write(snapshot);
            } finally {
              // Do not retain private export bytes after an operation settles,
              // regardless of whether its signed request succeeded or failed.
              snapshot.fill(0);
              queuedSnapshotBytes -= snapshot.byteLength;
              queuedWriteOperations -= 1;
            }
          });
        },

        complete(): Promise<void> {
          if (abortRequested) {
            return Promise.reject(new Error('S3 multipart writer was aborted'));
          }
          // Fence late writes synchronously, *before* the queued completion.
          completionRequested = true;
          return serialize(() => underlyingWriter.complete());
        },

        abort(): Promise<void> {
          // Fence late writes/completion synchronously but drain already
          // accepted writes before issuing multipart Abort for their uploadId.
          abortRequested = true;
          return serialize(() => underlyingWriter.abort());
        },
      };
    },

    createUploadIntent(
      input: Parameters<ObjectStorage['createUploadIntent']>[0],
    ): Promise<ObjectStorageUploadIntent> {
      const now = options.now?.() ?? new Date();
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
          'content-length': String(input.contentLength),
          'content-type': input.contentType,
          'if-none-match': '*',
        },
        now,
      });

      return Promise.resolve({
        url,
        method: 'PUT',
        headers: {
          'content-type': input.contentType,
          'if-none-match': '*',
        },
        expiresAt: new Date(now.getTime() + input.expiresInSeconds * 1000),
      });
    },

    async headObject(
      objectKey: string,
      timeoutMs = REQUEST_TIMEOUT_MS,
    ): Promise<ObjectStorageHead | null> {
      const response = await signedRequest({
        method: 'HEAD',
        endpoint,
        bucket: options.bucket,
        objectKey,
        region: options.region,
        accessKeyId: options.accessKeyId,
        secretAccessKey: options.secretAccessKey,
        timeoutMs,
        now: options.now?.(),
      });

      if (response.status === 404) return null;
      // B116: a successful-looking non-200 status is not proof that the
      // whole object exists with these bytes (202/204/206 in particular).
      if (!isConfirmedS3HeadObject(response.status)) {
        throw storageError('HEAD', response.status);
      }
      const byteSize = parseS3HeadObjectByteSize(
        response.headers.get('content-length'),
      );

      return {
        byteSize,
        contentType: response.headers.get('content-type'),
        etag: normalizeS3HeadObjectEtag(response.headers.get('etag')),
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
        now: options.now?.(),
      });

      if (!response.ok) throw storageError('GET prefix', response.status);
      return readBoundedS3PrefixBody(response, maximumBytes);
    },

    async *readObjectChunks(
      objectKey: string,
      maximumChunkBytes = 64 * 1024,
      signal?: AbortSignal,
    ): AsyncIterable<Uint8Array> {
      if (
        !Number.isSafeInteger(maximumChunkBytes) ||
        maximumChunkBytes < 1024 ||
        maximumChunkBytes > 1024 * 1024
      ) {
        throw new Error(
          'maximumChunkBytes must be an integer between 1024 and 1048576',
        );
      }

      const response = await signedRequest({
        method: 'GET',
        endpoint,
        bucket: options.bucket,
        objectKey,
        region: options.region,
        accessKeyId: options.accessKeyId,
        secretAccessKey: options.secretAccessKey,
        signal,
        now: options.now?.(),
      });

      // B114: neither 202 Accepted nor 206 Partial Content confirms the
      // full object requested without Range. Never forward partial bytes
      // to an export integrity check or file scanner.
      if (!isConfirmedS3FullObjectGet(response.status)) {
        void response.body?.cancel().catch(() => undefined);
        throw storageError('GET object', response.status);
      }
      if (!response.body) throw new Error('S3 GET object returned no body');
      let receivedBytes = 0;
      const reader = response.body.getReader();
      let streamEnded = false;
      let cancellation: Promise<void> | null = null;
      const cancelReader = () => {
        cancellation ??= reader.cancel().then(
          () => undefined,
          () => undefined,
        );
      };
      signal?.addEventListener('abort', cancelReader, { once: true });
      if (signal?.aborted) cancelReader();

      try {
        assertS3FullObjectReadActive(signal);
        // B115 parse metadata *inside* the reader's cleanup scope, so an
        // invalid Content-Length cancels the provider stream as well.
        const expectedBytes = parseS3FullObjectContentLength(
          response.headers.get('content-length'),
        );
        while (true) {
          assertS3FullObjectReadActive(signal);
          const result = await reader.read();
          // A cancelled reader may resolve as a successful EOF. Abort is
          // authoritative before done, after reads, and between yields.
          assertS3FullObjectReadActive(signal);
          if (result.done) {
            assertS3FullObjectContentLength(expectedBytes, receivedBytes, true);
            streamEnded = true;
            return;
          }
          if (!(result.value instanceof Uint8Array)) {
            throw new Error('S3 GET object returned invalid bytes');
          }
          // Validate before yielding any portion of a remote chunk.
          receivedBytes += result.value.byteLength;
          assertS3FullObjectContentLength(expectedBytes, receivedBytes, false);

          for (
            let offset = 0;
            offset < result.value.byteLength;
            offset += maximumChunkBytes
          ) {
            assertS3FullObjectReadActive(signal);
            yield result.value.subarray(
              offset,
              Math.min(offset + maximumChunkBytes, result.value.byteLength),
            );
          }
        }
      } finally {
        signal?.removeEventListener('abort', cancelReader);
        if (!streamEnded) cancelReader();
        await Promise.resolve(cancellation);
        reader.releaseLock();
      }
    },

    createDownloadIntent(
      input: Parameters<ObjectStorage['createDownloadIntent']>[0],
    ): Promise<ObjectStorageDownloadIntent> {
      const now = options.now?.() ?? new Date();
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
          ['response-cache-control', 'private, no-store'],
          ['response-content-type', input.contentType],
          [
            'response-content-disposition',
            responseDisposition(input.disposition, input.filename),
          ],
        ],
        now,
      });

      return Promise.resolve({
        url,
        expiresAt: new Date(now.getTime() + input.expiresInSeconds * 1000),
      });
    },

    deleteObject,
  });
}
