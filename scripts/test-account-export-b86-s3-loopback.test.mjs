import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { createServer } from 'node:http';
import test from 'node:test';

import { createS3ObjectStorage } from '../apps/api/src/files/storage/s3-object-storage.ts';
import { verifyAccountExportStoredBytes } from '../apps/api/src/data-lifecycle/domain/account-export-artifact-readback.ts';
import { verifyAccountExportDownload } from '../apps/api/src/data-lifecycle/storage/account-export-download-integrity.ts';
import { verifyB87S3SigV4 } from './testing/b87-s3-sigv4-verifier.mjs';

const JOB = '11111111-1111-4111-8111-111111111111';
const GENERATION = '22222222-2222-4222-8222-222222222222';
const OBJECT_KEY = `exports/${JOB}/${GENERATION}.json`;
const BUCKET = 'b86-private-acceptance';
const PATH = `/${BUCKET}/${OBJECT_KEY}`;
const CONTENT_TYPE = 'application/json; charset=utf-8';
const FIXTURE_TIME = new Date('2026-10-16T14:00:00Z');
const ACCESS_KEY_ID = 'b86-local-fixture';
const SECRET_ACCESS_KEY = 'fixture-only-not-live';

/**
 * B86 local-only HTTP *simulation* of selected S3 requests. Neither an
 * external S3 implementation nor production credentials are contacted.
 * The actual app S3ObjectStorage generates signed HTTP requests to it.
 */
async function withLoopback(input, scenario) {
  const objects = new Map();
  const uploads = new Map();
  const calls = [];
  let failDelete = input.failDelete ?? 0;
  // B95 faults affect only GET responses *after* SigV4 authorization.
  // Every GET still traverses the real signed S3 adapter and real TCP.
  const getFaults = [...(input.getFaults ?? [])];
  const partStatuses = [...(input.partStatuses ?? [])];
  const abortStatuses = [...(input.abortStatuses ?? [])];
  const deleteStatuses = [...(input.deleteStatuses ?? [])];
  const server = createServer(async (request, response) => {
    const url = new URL(request.url ?? '/', 'http://127.0.0.1');
    const method = request.method ?? '';
    const bytes = [];
    try {
      for await (const chunk of request) bytes.push(Buffer.from(chunk));
      const body = Buffer.concat(bytes);
      const uploadId = url.searchParams.get('uploadId');
      const part = url.searchParams.get('partNumber');
      calls.push({ method, path: url.pathname, uploadId, part, bytes: body.length,
        ...((method === 'GET' && input.captureGetHeaders) ||
          (method === 'HEAD' && input.captureHeadHeaders) ||
          ((method === 'POST' || method === 'PUT') && input.captureWriteHeaders)
          ? { requestHeaders: { ...request.headers } } : {}),
      });
      const trusted = verifyB87S3SigV4({
        method,
        url: new URL(request.url ?? '/', `http://${request.headers.host ?? ''}`),
        headers: request.headers,
        body,
        bucket: BUCKET,
        objectKey: OBJECT_KEY,
        region: 'us-east-1',
        accessKeyId: ACCESS_KEY_ID,
        secretAccessKey: SECRET_ACCESS_KEY,
        now: FIXTURE_TIME,
      });
      // A *real* HTTP request with a plausible AWS4 prefix is not enough.
      // Deny wrong signature, modified payload/query, key, host or clock.
      if (!trusted) {
        response.writeHead(403);
        response.end('SignatureDoesNotMatch');
        return;
      }
      assert.equal(url.pathname, PATH, 'never access another bucket or object');
      assert.match(request.headers.authorization ?? '', /^AWS4-HMAC-SHA256 /u);
      assert.match(request.headers['x-amz-date'] ?? '', /^\d{8}T\d{6}Z$/u);
      if (method === 'POST' && url.searchParams.has('uploads')) {
        const id = input.initiationUploadId ?? randomUUID();
        uploads.set(id, []);
        input.onInitiation?.();
        if (input.initiationDelayMs) {
          await new Promise(resolve => setTimeout(resolve, input.initiationDelayMs));
        }
        response.writeHead(input.initiationStatus ?? 200, { 'content-type': 'application/xml' });
        response.end(input.initiateMultipartBody ?? `<InitiateMultipartUploadResult><UploadId>${id}</UploadId></InitiateMultipartUploadResult>`);
      } else if (method === 'PUT' && uploadId && part) {
        const upload = uploads.get(uploadId);
        if (!upload) { response.writeHead(404); response.end(); return; }
        const status = partStatuses.shift() ?? 200;
        if (status !== 200) {
          response.writeHead(status, input.partNon200Etag
            ? { etag: '"plausible-but-unconfirmed"' } : undefined);
          response.end(); return;
        }
        upload[Number(part) - 1] = body;
        response.writeHead(200, { etag: input.partEtag ?? '"b86-part-etag"' });
        response.end();
      } else if (method === 'POST' && uploadId) {
        const upload = uploads.get(uploadId);
        if (!upload) { response.writeHead(404); response.end(); return; }
        objects.set(url.pathname, Buffer.concat(upload));
        uploads.delete(uploadId);
        if (input.loseMultipartAck) {
          response.destroy();
        } else {
          response.writeHead(input.completeStatus ?? 200, { 'content-type': 'application/xml' });
          response.end(input.completeMultipartBody ??
            `<CompleteMultipartUploadResult><Bucket>${BUCKET}</Bucket>` +
            `<Key>${OBJECT_KEY}</Key><ETag>"fixture-etag"</ETag>` +
            '</CompleteMultipartUploadResult>');
        }
      } else if (method === 'PUT' && !uploadId) {
        objects.set(url.pathname, body);
        if (input.losePutAck) response.destroy();
        else { response.writeHead(input.singlePutStatus ?? 200); response.end(); }
      } else if (method === 'DELETE' && uploadId) {
        const status = abortStatuses.shift() ?? 204;
        // 202 means the server *accepted* abort asynchronously, not that
        // this multipart generation has been removed. B113 must retry.
        if (status === 204 || status === 200 || status === 404) {
          uploads.delete(uploadId);
        }
        response.writeHead(status); response.end();
      } else if (method === 'DELETE') {
        if (failDelete > 0) {
          failDelete -= 1;
          response.writeHead(503); response.end();
        } else {
          const status = deleteStatuses.shift() ?? 204;
          // B120: an ambiguous provider ACK can mean the object is still
          // present OR already absent. Only the Mongo owner-fenced cleanup
          // policy may decide how to retry; the adapter cannot assume success.
          if (status === 200 || status === 204 || status === 404 ||
              input.commitDeleteOnAmbiguous === true) {
            objects.delete(url.pathname);
          }
          response.writeHead(status); response.end();
        }
      } else if (method === 'HEAD') {
        // B117: HEAD must traverse real localhost TCP with B87 independent
        // SigV4 verification *before* returning provider metadata.
        const obj = objects.get(url.pathname);
        const reply = input.headReply ?? {};
        const status = reply.status ?? (obj ? 200 : 404);
        const headers = {
          ...(status === 200 ? {
            'content-type': CONTENT_TYPE,
            ...(reply.omitEtag ? {} : { etag: reply.etag ?? '"b117-etag"' }),
          } : {}),
          ...(obj && status !== 404 && status !== 204 && !reply.omitLength
            ? { 'content-length': reply.contentLength ?? String(obj.byteLength) } : {}),
        };
        response.writeHead(status, headers);
        response.end();
      } else if (method === 'GET') {
        const obj = objects.get(url.pathname);
        const fault = getFaults.shift() ?? 'healthy';
        if (fault === '503') {
          response.writeHead(503); response.end(); return;
        }
        if (fault === '404' || !obj) {
          response.writeHead(404); response.end(); return;
        }
        // B111: simulate HTTP 206 metadata *after* validating SigV4.
        // A bad Content-Range must not cause a different byte window to be
        // accepted as the start of a private object.
        if (input.prefixResponse && request.headers.range) {
          const reply = input.prefixResponse;
          response.writeHead(reply.status ?? 206, {
            'content-type': CONTENT_TYPE,
            ...(reply.contentRange === null ? {} :
              { 'content-range': reply.contentRange }),
          });
          response.end(reply.body ?? obj);
          return;
        }
        const delivered = Buffer.from(obj);
        if (fault === 'partial-full-get' && !request.headers.range) {
          // Deliberately wrong: the caller asked for the whole object,
          // but the compatible provider emitted only a partial response.
          const slice = delivered.subarray(0, Math.min(8, delivered.length));
          response.writeHead(206, {
            'content-type': CONTENT_TYPE,
            'content-range': `bytes 0-${slice.length - 1}/${delivered.length}`,
          });
          response.end(slice);
          return;
        }
        if (fault === 'corrupt') {
          delivered[Math.floor(delivered.length / 2)] ^= 0x01;
        } else if (fault === 'short') {
          // A provider may answer HTTP 200 with fewer bytes than committed.
        } else if (fault === 'large') {
          response.writeHead(200, { 'content-type': CONTENT_TYPE });
          response.end(Buffer.concat([delivered, Buffer.from('!')]));
          return;
        } else if (fault !== 'healthy') {
          throw new Error('Unexpected B95 fixture GET fault');
        }
        response.writeHead(200, {
          'content-type': CONTENT_TYPE,
          ...(input.declareFullGetLength && !request.headers.range
            ? { 'content-length': delivered.length } : {}),
        });
        response.end(fault === 'short' ? delivered.subarray(0, delivered.length - 1) : delivered);
      } else {
        response.writeHead(405); response.end();
      }
    } catch (error) {
      response.writeHead(500); response.end();
    }
  });
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  try {
    const address = server.address();
    assert.ok(address && typeof address !== 'string');
    const endpoint = `http://127.0.0.1:${address.port}`;
    const storage = createS3ObjectStorage({
      endpoint, bucket: BUCKET, region: 'us-east-1',
      accessKeyId: ACCESS_KEY_ID, secretAccessKey: SECRET_ACCESS_KEY,
      configurationPrefix: 'ACCOUNT_EXPORT_S3',
      now: () => FIXTURE_TIME,
    });
    await scenario({ storage, objects, uploads, calls, endpoint });
  } finally {
    server.closeAllConnections();
    await new Promise(resolve => server.close(resolve));
  }
}

async function getBytes(storage) {
  const collected = [];
  for await (const chunk of storage.readObjectChunks(OBJECT_KEY)) {
    collected.push(Buffer.from(chunk));
  }
  return Buffer.concat(collected);
}
const newWriter = storage => storage.createMultipartWriter({
  objectKey: OBJECT_KEY, contentType: CONTENT_TYPE,
  deleteObjectOnAbort: false,
});

test('B86 signed real HTTP PUT/GET/DELETE round-trip for a private export generation', async () => {
  await withLoopback({}, async ({ storage, objects, calls }) => {
    const writer = newWriter(storage);
    const bytes = Buffer.from('{"owner":"private","sections":30}');
    await writer.write(bytes);
    await writer.complete();
    const fromS3 = await getBytes(storage);
    assert.equal(createHash('sha256').update(fromS3).digest('hex'),
      createHash('sha256').update(bytes).digest('hex'));
    assert.equal(objects.has(PATH), true);
    await storage.deleteObject(OBJECT_KEY);
    assert.equal(objects.has(PATH), false);
    assert.deepEqual(calls.map(call => call.method), ['PUT', 'GET', 'DELETE']);
  });
});

test('B86 lost single PUT response preserves committed bytes until explicit cleanup', async () => {
  await withLoopback({ losePutAck: true, failDelete: 1 }, async ({ storage, objects, calls }) => {
    const writer = newWriter(storage);
    const bytes = Buffer.from('{"private":"attempt"}');
    await writer.write(bytes);
    await assert.rejects(writer.complete());
    await writer.abort();
    assert.deepEqual(objects.get(PATH), bytes);
    assert.deepEqual(calls.map(call => call.method), ['PUT']);
    await assert.rejects(storage.deleteObject(OBJECT_KEY), /503/u);
    assert.equal(objects.has(PATH), true, '503 must not be treated as deletion');
    await storage.deleteObject(OBJECT_KEY);
    assert.equal(objects.has(PATH), false);
    assert.deepEqual(calls.map(call => call.method), ['PUT', 'DELETE', 'DELETE']);
  });
});

test('B86 lost multipart completion ACK aborts upload ID only, not committed object', async () => {
  await withLoopback({ loseMultipartAck: true }, async ({ storage, objects, calls }) => {
    const writer = newWriter(storage);
    const bytes = Buffer.alloc(5 * 1024 * 1024, 0x66);
    await writer.write(bytes);
    await assert.rejects(writer.complete());
    assert.deepEqual(objects.get(PATH), bytes);
    await writer.abort();
    assert.equal(objects.has(PATH), true);
    assert.deepEqual(calls.map(call => call.method), ['POST', 'PUT', 'POST', 'DELETE']);
    assert.ok(calls[3].uploadId, 'multipart DELETE must include uploadId');
    await storage.deleteObject(OBJECT_KEY);
    assert.equal(objects.has(PATH), false);
    assert.equal(calls[4].uploadId, null, 'explicit cleanup targets exact object');
  });
});

test('B86 aborted unfinished multipart has no naked DELETE for private exports', async () => {
  await withLoopback({}, async ({ storage, objects, calls, uploads }) => {
    const writer = newWriter(storage);
    await writer.write(Buffer.alloc(5 * 1024 * 1024, 0x61));
    await writer.abort();
    await writer.abort();
    assert.equal(objects.has(PATH), false);
    assert.equal(uploads.size, 0);
    assert.deepEqual(calls.map(call => call.method), ['POST', 'PUT', 'DELETE']);
    assert.ok(calls[2].uploadId);
  });
});

test('B87 loopback rejects a forged SigV4 signature before storing bytes', async () => {
  await withLoopback({}, async ({ endpoint, objects, calls }) => {
    const response = await fetch(`${endpoint}${PATH}`, {
      method: 'PUT',
      headers: {
        'x-amz-date': '20261016T140000Z',
        'x-amz-content-sha256': createHash('sha256').update('evil').digest('hex'),
        authorization: 'AWS4-HMAC-SHA256 Credential=' +
          ACCESS_KEY_ID + '/20261016/us-east-1/s3/aws4_request, ' +
          'SignedHeaders=host;x-amz-content-sha256;x-amz-date, ' +
          'Signature=' + '0'.repeat(64),
      },
      body: 'evil',
    });
    assert.equal(response.status, 403);
    assert.equal(objects.has(PATH), false);
    assert.deepEqual(calls.map(call => call.method), ['PUT']);
  });
});

test('B87 loopback denies payload modification after the app generated SigV4', async () => {
  await withLoopback({}, async ({ storage, objects, calls }) => {
    const realFetch = globalThis.fetch;
    // Fault injector corrupts only the serialized body after signing.
    // SigV4 must reject the request even if Authorization is untouched.
    globalThis.fetch = (url, init) => {
      if (init?.method !== 'PUT') return realFetch(url, init);
      const body = Buffer.from(init.body);
      body[0] ^= 0x01;
      return realFetch(url, { ...init, body });
    };
    try {
      const writer = newWriter(storage);
      await writer.write(Buffer.from('{"confidential":true}'));
      await assert.rejects(writer.complete(), /HTTP 403/u);
      await writer.abort();
      assert.equal(objects.has(PATH), false);
      assert.deepEqual(calls.map(call => call.method), ['PUT']);
    } finally {
      globalThis.fetch = realFetch;
    }
  });
});

test('B87 loopback refuses a signed request rerouted to another object key', async () => {
  await withLoopback({}, async ({ storage, objects, calls }) => {
    const realFetch = globalThis.fetch;
    globalThis.fetch = (url, init) => realFetch(
      String(url).replace('/exports/' + JOB + '/', '/exports/other-owner/'),
      init,
    );
    try {
      const writer = newWriter(storage);
      await writer.write(Buffer.from('private'));
      await assert.rejects(writer.complete(), /HTTP 403/u);
      await writer.abort();
      assert.equal(objects.has(PATH), false);
      assert.equal(calls[0].method, 'PUT');
      assert.notEqual(calls[0].path, PATH);
    } finally {
      globalThis.fetch = realFetch;
    }
  });
});

const B95_CONTENT = Buffer.from('{"owner":"private","blocks":["study","notes"],"revision":1}');
const B95_EXPECTED = {
  byteLength: B95_CONTENT.byteLength,
  sha256: createHash('sha256').update(B95_CONTENT).digest('hex'),
};

async function b95WriteHealthy(storage) {
  const writer = newWriter(storage);
  await writer.write(B95_CONTENT);
  await writer.complete();
}

test('B95 exact authenticated HTTP S3 readback verifies published bytes before use', async () => {
  await withLoopback({}, async ({ storage, objects, calls }) => {
    await b95WriteHealthy(storage);
    await assert.doesNotReject(verifyAccountExportStoredBytes(
      storage.readObjectChunks(OBJECT_KEY), B95_EXPECTED,
    ));
    const transmitted = [];
    for await (const chunk of verifyAccountExportDownload(
      storage.readObjectChunks(OBJECT_KEY),
      B95_EXPECTED.byteLength, B95_EXPECTED.sha256,
    )) transmitted.push(Buffer.from(chunk));
    assert.deepEqual(Buffer.concat(transmitted), B95_CONTENT);
    assert.deepEqual(calls.map(call => call.method), ['PUT', 'GET', 'GET']);
    assert.deepEqual(objects.get(PATH), B95_CONTENT);
  });
});

test('B95 real HTTP signed GET with 200 same-length corrupt body refuses B90 readback', async () => {
  await withLoopback({ getFaults: ['corrupt'] }, async ({ storage, objects, calls }) => {
    await b95WriteHealthy(storage);
    await assert.rejects(verifyAccountExportStoredBytes(
      storage.readObjectChunks(OBJECT_KEY), B95_EXPECTED,
    ), /S3 readback SHA-256 mismatch/u);
    assert.deepEqual(calls.map(call => call.method), ['PUT', 'GET']);
    assert.deepEqual(objects.get(PATH), B95_CONTENT);
  });
});

test('B95 real HTTP 200 truncated S3 body refuses B90 readback before publication', async () => {
  await withLoopback({ getFaults: ['short'] }, async ({ storage, objects, calls }) => {
    await b95WriteHealthy(storage);
    await assert.rejects(verifyAccountExportStoredBytes(
      storage.readObjectChunks(OBJECT_KEY), B95_EXPECTED,
    ), /S3 readback byte length mismatch/u);
    assert.deepEqual(calls.map(call => call.method), ['PUT', 'GET']);
    assert.deepEqual(objects.get(PATH), B95_CONTENT);
  });
});

test('B95 real HTTP 200 overlong S3 body refuses B90 readback without object deletion', async () => {
  await withLoopback({ getFaults: ['large'] }, async ({ storage, objects, calls }) => {
    await b95WriteHealthy(storage);
    await assert.rejects(verifyAccountExportStoredBytes(
      storage.readObjectChunks(OBJECT_KEY), B95_EXPECTED,
    ), /S3 readback exceeds expected byte length/u);
    assert.deepEqual(calls.map(call => call.method), ['PUT', 'GET']);
    assert.deepEqual(objects.get(PATH), B95_CONTENT);
  });
});

test('B95 signed HTTP GET 404/503 fails closed without touching stored bytes', async () => {
  for (const status of ['404', '503']) {
    await withLoopback({ getFaults: [status] }, async ({ storage, objects, calls }) => {
      await b95WriteHealthy(storage);
      await assert.rejects(verifyAccountExportStoredBytes(
        storage.readObjectChunks(OBJECT_KEY), B95_EXPECTED,
      ), new RegExp('S3 GET object failed with HTTP ' + status, 'u'));
      assert.deepEqual(calls.map(call => call.method), ['PUT', 'GET']);
      assert.deepEqual(objects.get(PATH), B95_CONTENT);
    });
  }
});

test('B95 B91 second signed HTTP GET detects mutation after valid preflight', async () => {
  await withLoopback({ getFaults: ['healthy', 'corrupt'] }, async ({ storage, objects, calls }) => {
    await b95WriteHealthy(storage);
    await assert.doesNotReject(verifyAccountExportStoredBytes(
      storage.readObjectChunks(OBJECT_KEY), B95_EXPECTED,
    ));
    const received = [];
    await assert.rejects(async () => {
      for await (const chunk of verifyAccountExportDownload(
        storage.readObjectChunks(OBJECT_KEY),
        B95_EXPECTED.byteLength, B95_EXPECTED.sha256,
      )) received.push(Buffer.from(chunk));
    }, /download integrity check failed/u);
    // This failure occurs at EOF: already-sent chunks cannot be retracted.
    assert.equal(Buffer.concat(received).byteLength, B95_CONTENT.byteLength);
    assert.deepEqual(calls.map(call => call.method), ['PUT', 'GET', 'GET']);
    assert.deepEqual(objects.get(PATH), B95_CONTENT);
  });
});

test('B97 signed HTTP 200 multipart caps an oversized streamed response without deleting the object', async () => {
  await withLoopback({
    completeMultipartBody: 'x'.repeat(64 * 1024 + 1),
  }, async ({ storage, objects, calls }) => {
    const writer = newWriter(storage);
    await writer.write(Buffer.alloc(5 * 1024 * 1024, 0x64));
    await assert.rejects(writer.complete(), /exceeds 65536 bytes/u);
    // The fixture committed before answering. Abort must never issue
    // an owner-unfenced object deletion on an ambiguous completion.
    assert.equal(objects.has(PATH), true);
    await writer.abort();
    assert.equal(objects.has(PATH), true);
    assert.deepEqual(calls.map(call => call.method),
      ['POST', 'PUT', 'POST', 'DELETE']);
    assert.ok(calls[3].uploadId);
    assert.equal(calls.some(call => call.method === 'DELETE' && !call.uploadId), false);
  });
});

test('B96 real signed HTTP multipart rejects a blank or Error body without object DELETE', async () => {
  for (const resultBody of [
    '',
    '<Error><Code>InternalError</Code></Error>',
    '<html>not a completion</html>',
  ]) {
    await withLoopback({ completeMultipartBody: resultBody }, async ({
      storage, objects, calls,
    }) => {
      const writer = newWriter(storage);
      await writer.write(Buffer.alloc(5 * 1024 * 1024, 0x67));
      await assert.rejects(writer.complete(), /Complete multipart upload/u);
      // The local provider already wrote a committed object before its
      // ambiguous HTTP 200 reply. B80 owns cleanup; abort only targets ID.
      assert.equal(objects.has(PATH), true);
      await writer.abort();
      assert.equal(objects.has(PATH), true);
      assert.deepEqual(calls.map(call => call.method),
        ['POST', 'PUT', 'POST', 'DELETE']);
      assert.ok(calls[3].uploadId, 'abort must target uploadId only');
      assert.equal(calls.filter(call =>
        call.method === 'DELETE' && call.uploadId === null).length, 0);
    });
  }
});

test('B101 SigV4 HTTP accepts bucket/key-fenced initiation and verifies committed bytes', async () => {
  const id = 'b101-local-upload-id';
  const initiateMultipartBody =
    '<?xml version="1.0" encoding="UTF-8"?>' +
    '<InitiateMultipartUploadResult xmlns="http://s3.amazonaws.com/doc/2006-03-01/">' +
    '<Bucket>' + BUCKET + '</Bucket><Key>' + OBJECT_KEY + '</Key>' +
    '<UploadId>' + id + '</UploadId></InitiateMultipartUploadResult>';
  await withLoopback({ initiationUploadId: id, initiateMultipartBody },
    async ({ storage, objects, calls, uploads }) => {
      const writer = newWriter(storage);
      const bytes = Buffer.alloc(5 * 1024 * 1024, 0x71);
      await writer.write(bytes);
      await writer.complete();
      await verifyAccountExportStoredBytes(storage.readObjectChunks(OBJECT_KEY), {
        byteLength: bytes.length,
        sha256: createHash('sha256').update(bytes).digest('hex'),
      });
      assert.deepEqual(objects.get(PATH), bytes);
      assert.equal(uploads.size, 0);
      assert.deepEqual(calls.map(call => call.method), ['POST', 'PUT', 'POST', 'GET']);
      assert.equal(calls[1].uploadId, id);
      assert.equal(calls[2].uploadId, id);
      assert.equal(calls.some(call => call.method === 'DELETE'), false);
    });
});

test('B101 SigV4 HTTP rejects cross-key initiation before signing any part or deleting object', async () => {
  const initiateMultipartBody =
    '<InitiateMultipartUploadResult><Bucket>' + BUCKET + '</Bucket>' +
    '<Key>exports/someone-else/private.json</Key>' +
    '<UploadId>b101-cross-key-id</UploadId></InitiateMultipartUploadResult>';
  await withLoopback({ initiateMultipartBody }, async ({ storage, objects, uploads, calls }) => {
    const writer = newWriter(storage);
    await assert.rejects(writer.write(Buffer.alloc(5 * 1024 * 1024, 0x71)),
      /S3 multipart upload id is missing or invalid/u);
    await writer.abort();
    assert.equal(objects.has(PATH), false);
    assert.equal(uploads.size, 1, 'provider-upload lifecycle handles unconfirmed initiation');
    assert.deepEqual(calls.map(call => call.method), ['POST']);
    assert.equal(calls.some(call => call.method === 'DELETE'), false);
  });
});

test('B100 signed HTTP refuses oversized initiation body without part upload or object DELETE', async () => {
  await withLoopback({ initiateMultipartBody: 'x'.repeat(64 * 1024 + 1) },
    async ({ storage, objects, uploads, calls }) => {
      const writer = newWriter(storage);
      await assert.rejects(writer.write(Buffer.alloc(5 * 1024 * 1024)),
        /S3 multipart initiation response exceeds 65536 bytes/u);
      await writer.abort();
      assert.equal(objects.has(PATH), false);
      assert.equal(uploads.size, 1,
        'unconfirmed provider upload is recovered by bucket lifecycle, not naked object DELETE');
      assert.deepEqual(calls.map(call => call.method), ['POST']);
    });
});

test('B100 signed HTTP rejects forged initiation XML before sending any part', async () => {
  await withLoopback({ initiateMultipartBody:
    '<Error><UploadId>forged</UploadId></Error>' },
  async ({ storage, objects, calls }) => {
    const writer = newWriter(storage);
    await assert.rejects(writer.write(Buffer.alloc(5 * 1024 * 1024)),
      /S3 multipart upload id is missing or invalid/u);
    await writer.abort();
    assert.equal(objects.has(PATH), false);
    assert.deepEqual(calls.map(call => call.method), ['POST']);
  });
});

test('B99 signed HTTP accepts a canonical AWS completion envelope with ETag', async () => {
  const completeMultipartBody =
    '<?xml version="1.0" encoding="UTF-8"?>' +
    '<CompleteMultipartUploadResult xmlns="http://s3.amazonaws.com/doc/2006-03-01/">' +
    '<Location>https://s3.local/bucket/key</Location><Bucket>' + BUCKET + '</Bucket>' +
    '<Key>' + OBJECT_KEY + '</Key><ETag>"etag"</ETag></CompleteMultipartUploadResult>';
  await withLoopback({ completeMultipartBody }, async ({ storage, objects, calls }) => {
    const writer = newWriter(storage);
    await writer.write(Buffer.alloc(5 * 1024 * 1024, 0x65));
    await assert.doesNotReject(writer.complete());
    assert.equal(objects.has(PATH), true);
    assert.deepEqual(calls.map(call => call.method), ['POST', 'PUT', 'POST']);
  });
});

test('B120 signed DELETE rejects 202 and 206 whether provider kept or removed bytes', async () => {
  for (const status of [202, 206]) {
    for (const committedDespiteAmbiguousAck of [false, true]) {
      await withLoopback({
        deleteStatuses: [status],
        commitDeleteOnAmbiguous: committedDespiteAmbiguousAck,
      }, async ({ storage, objects, calls }) => {
        const writer = newWriter(storage);
        const bytes = Buffer.from('{"b120":"private-retirement"}');
        await writer.write(bytes);
        await writer.complete();
        await assert.rejects(storage.deleteObject(OBJECT_KEY),
          new RegExp('S3 DELETE failed with HTTP ' + status, 'u'));
        assert.deepEqual(calls.map(call => call.method), ['PUT', 'DELETE'],
          'no unsafe automatic retry of an ambiguous private generation');
        assert.deepEqual(objects.get(PATH),
          committedDespiteAmbiguousAck ? undefined : bytes);
      });
    }
  }
});

test('B120 signed DELETE accepts only terminal 200, 204 and idempotent 404', async () => {
  for (const status of [200, 204, 404]) {
    await withLoopback({ deleteStatuses: [status] },
      async ({ storage, objects, calls }) => {
        if (status !== 404) {
          const writer = newWriter(storage);
          await writer.write(Buffer.from('{"b120":"terminal-delete"}'));
          await writer.complete();
        }
        await assert.doesNotReject(storage.deleteObject(OBJECT_KEY));
        assert.equal(objects.has(PATH), false);
        assert.deepEqual(calls.map(call => call.method),
          status === 404 ? ['DELETE'] : ['PUT', 'DELETE']);
      });
  }
});

test('B119 signed HEAD rejects malformed present ETags without deleting private bytes', async () => {
  for (const etag of ['"unbalanced', 'unbalanced"', '"bad"inside"', 'bad etag',
    'x'.repeat(255)]) {
    await withLoopback({ headReply: { status: 200, etag } },
      async ({ storage, objects, calls }) => {
        const writer = newWriter(storage);
        const bytes = Buffer.from('{"b119":"private-head-etag"}');
        await writer.write(bytes);
        await writer.complete();
        await assert.rejects(storage.headObject(OBJECT_KEY),
          /S3 HEAD returned an invalid ETag/u);
        assert.deepEqual(objects.get(PATH), bytes);
        assert.deepEqual(calls.map(call => call.method), ['PUT', 'HEAD']);
        assert.equal(calls.some(call => call.method === 'DELETE'), false);
      });
  }
});

test('B119 signed HEAD preserves balanced opaque tokens and optional missing ETag', async () => {
  for (const headReply of [
    { status: 200, etag: '"abcd0123-2"' },
    { status: 200, etag: 'opaque-compatible' },
    { status: 200, omitEtag: true },
  ]) {
    await withLoopback({ headReply }, async ({ storage, objects, calls }) => {
      const writer = newWriter(storage);
      const bytes = Buffer.from('{"b119":"compatible-head"}');
      await writer.write(bytes);
      await writer.complete();
      const result = await storage.headObject(OBJECT_KEY);
      assert.equal(result?.byteSize, bytes.length);
      assert.equal(result?.contentType, CONTENT_TYPE);
      assert.equal(result?.etag, headReply.omitEtag ? null :
        headReply.etag.replace(/^"|"$/gu, ''));
      assert.deepEqual(objects.get(PATH), bytes);
      assert.deepEqual(calls.map(call => call.method), ['PUT', 'HEAD']);
    });
  }
});

test('B117 signed HEAD confirms exact private metadata and returns 404 after deletion', async () => {
  await withLoopback({ captureHeadHeaders: true }, async ({ storage, objects, calls }) => {
    const writer = newWriter(storage);
    const bytes = Buffer.from('{"b117":"private-head-metadata"}');
    await writer.write(bytes);
    await writer.complete();

    const head = await storage.headObject(OBJECT_KEY);
    assert.deepEqual(head, {
      byteSize: bytes.length, contentType: CONTENT_TYPE, etag: 'b117-etag',
    });
    assert.deepEqual(objects.get(PATH), bytes);
    assert.equal(calls[1].method, 'HEAD');
    assert.equal(calls[1].path, PATH);
    assert.match(calls[1].requestHeaders.authorization,
      /SignedHeaders=host;x-amz-content-sha256;x-amz-date,/u);

    await storage.deleteObject(OBJECT_KEY);
    assert.equal(await storage.headObject(OBJECT_KEY), null);
    assert.deepEqual(calls.map(call => call.method), ['PUT', 'HEAD', 'DELETE', 'HEAD']);
    assert.equal(objects.has(PATH), false);
  });
});

test('B117 signed HEAD rejects unconfirmed HTTP 202 and partial HTTP 206 metadata', async () => {
  for (const status of [202, 206]) {
    await withLoopback({ headReply: { status } }, async ({ storage, objects, calls }) => {
      const writer = newWriter(storage);
      const bytes = Buffer.from('{"b117":"cannot-confirm-head"}');
      await writer.write(bytes);
      await writer.complete();
      await assert.rejects(storage.headObject(OBJECT_KEY),
        new RegExp('S3 HEAD failed with HTTP ' + status, 'u'));
      assert.deepEqual(objects.get(PATH), bytes,
        'a failed metadata read cannot mutate the private object');
      assert.deepEqual(calls.map(call => call.method), ['PUT', 'HEAD']);
      assert.equal(calls.some(call => call.method === 'DELETE'), false);
    });
  }
});

test('B117 signed HEAD denies 204 and an HTTP 200 missing Content-Length', async () => {
  for (const reply of [{ status: 204 }, { status: 200, omitLength: true }]) {
    await withLoopback({ headReply: reply }, async ({ storage, objects, calls }) => {
      const writer = newWriter(storage);
      const bytes = Buffer.from('{"b117":"no-head-proof"}');
      await writer.write(bytes);
      await writer.complete();
      await assert.rejects(storage.headObject(OBJECT_KEY),
        reply.status === 204
          ? /S3 HEAD failed with HTTP 204/u
          : /S3 HEAD returned an invalid content length/u);
      assert.deepEqual(objects.get(PATH), bytes);
      assert.deepEqual(calls.map(call => call.method), ['PUT', 'HEAD']);
    });
  }
});

test('B117 signed HEAD fails closed for noncanonical and unsafe Content-Length', async () => {
  for (const contentLength of ['', '01', '8e2', '8, 8', '9007199254740992']) {
    await withLoopback({ headReply: { status: 200, contentLength } },
      async ({ storage, objects, calls }) => {
        const writer = newWriter(storage);
        const bytes = Buffer.from('{"b117":"bad-head-length"}');
        await writer.write(bytes);
        await writer.complete();
        // Node/Undici may reject syntactically invalid Content-Length on
        // the transport boundary before the S3 adapter sees the response.
        // Either transport rejection or adapter metadata rejection is safe;
        // a successful HEAD would be the regression.
        await assert.rejects(storage.headObject(OBJECT_KEY));
        assert.deepEqual(objects.get(PATH), bytes);
        assert.deepEqual(calls.map(call => call.method), ['PUT', 'HEAD']);
        assert.equal(calls.some(call => call.method === 'DELETE'), false);
      });
  }
});

test('B115 signed GET verifies a declared exact private object length', async () => {
  await withLoopback({ declareFullGetLength: true },
    async ({ storage, objects, calls }) => {
      const writer = newWriter(storage);
      const bytes = Buffer.from('{"b115":"complete-read"}');
      await writer.write(bytes);
      await writer.complete();
      assert.deepEqual(await getBytes(storage), bytes);
      assert.deepEqual(objects.get(PATH), bytes);
      assert.deepEqual(calls.map(call => call.method), ['PUT', 'GET']);
    });
});

test('B115 signed GET must not accept a prematurely terminated declared body', async () => {
  await withLoopback({ declareFullGetLength: true, getFaults: ['short'] },
    async ({ storage, objects, calls }) => {
      const writer = newWriter(storage);
      const bytes = Buffer.from('{"b115":"truncated-read"}');
      await writer.write(bytes);
      await writer.complete();
      // On native TCP, undici may reject the response with 'terminated'
      // before the adapter sees EOF; either path MUST reject, never publish
      // a successful short read.
      await assert.rejects(getBytes(storage));
      assert.deepEqual(objects.get(PATH), bytes);
      assert.deepEqual(calls.map(call => call.method), ['PUT', 'GET']);
      assert.equal(calls.some(call => call.method === 'DELETE'), false);
    });
});

test('B114 signed full GET refuses HTTP 206 even with plausible Content-Range', async () => {
  await withLoopback({ getFaults: ['partial-full-get'] },
    async ({ storage, calls, objects }) => {
      const writer = newWriter(storage);
      const bytes = Buffer.from('{"private":"b114-full-object-read"}');
      await writer.write(bytes);
      await writer.complete();
      await assert.rejects(getBytes(storage),
        /S3 GET object failed with HTTP 206/u);
      assert.deepEqual(objects.get(PATH), bytes,
        'read failure must not alter the committed private generation');
      assert.deepEqual(calls.map(call => call.method), ['PUT', 'GET']);
      assert.equal(calls.some(call => call.method === 'DELETE'), false);
    });
});

test('B114 signed full GET abort between chunks must reject as AbortError', async () => {
  await withLoopback({}, async ({ storage, calls, objects }) => {
    const writer = newWriter(storage);
    const bytes = Buffer.alloc(4096, 0x72);
    await writer.write(bytes);
    await writer.complete();
    const controller = new AbortController();
    const iterator = storage.readObjectChunks(
      OBJECT_KEY, 1024, controller.signal,
    )[Symbol.asyncIterator]();
    const first = await iterator.next();
    assert.equal(first.done, false);
    assert.equal(first.value.byteLength, 1024);
    controller.abort();
    await assert.rejects(iterator.next(), error => error?.name === 'AbortError');
    assert.deepEqual(objects.get(PATH), bytes);
    assert.deepEqual(calls.map(call => call.method), ['PUT', 'GET']);
    assert.equal(calls.some(call => call.method === 'DELETE'), false);
  });
});

test('B113 signed HTTP refuses 202 single PUT even when provider persisted private bytes', async () => {
  await withLoopback({ singlePutStatus: 202 },
    async ({ storage, objects, calls }) => {
      const writer = newWriter(storage);
      const bytes = Buffer.from('{"b113":"ambiguous"}');
      await writer.write(bytes);
      await assert.rejects(writer.complete(), /S3 PUT object failed with HTTP 202/u);
      await assert.rejects(writer.complete(),
        /S3 multipart writer cannot complete after a failed operation/u);
      await writer.abort();
      assert.deepEqual(objects.get(PATH), bytes,
        'private cleanup remains owner-fenced even when provider already stored bytes');
      assert.deepEqual(calls.map(call => call.method), ['PUT']);
    });
});

test('B113 signed HTTP refuses 202 initiation XML without issuing unsigned parts', async () => {
  await withLoopback({ initiationStatus: 202 },
    async ({ storage, objects, calls, uploads }) => {
      const writer = newWriter(storage);
      await assert.rejects(writer.write(Buffer.alloc(5 * 1024 * 1024, 0x61)),
        /S3 Create multipart upload failed with HTTP 202/u);
      await assert.rejects(writer.complete(),
        /S3 multipart writer cannot complete after a failed operation/u);
      await writer.abort();
      assert.deepEqual(calls.map(call => call.method), ['POST']);
      assert.equal(objects.size, 0);
      assert.equal(uploads.size, 1,
        'unconfirmed provider initiation must be left to configured S3 multipart lifecycle');
    });
});

test('B113 signed HTTP refuses 206 UploadPart even with valid-looking ETag and aborts ID', async () => {
  await withLoopback({ partStatuses: [206], partNon200Etag: true },
    async ({ storage, objects, calls, uploads }) => {
      const writer = newWriter(storage);
      await assert.rejects(writer.write(Buffer.alloc(5 * 1024 * 1024, 0x62)),
        /S3 Upload multipart part failed with HTTP 206/u);
      await assert.rejects(writer.complete(),
        /S3 multipart writer cannot complete after a failed operation/u);
      await writer.abort();
      assert.deepEqual(calls.map(call => call.method), ['POST', 'PUT', 'DELETE']);
      assert.ok(calls[2].uploadId);
      assert.equal(calls.some(call => call.method === 'DELETE' && !call.uploadId), false);
      assert.equal(objects.size, 0);
      assert.equal(uploads.size, 0);
    });
});

test('B113 signed HTTP refuses 202 completion XML and keeps committed private generation', async () => {
  await withLoopback({ completeStatus: 202 },
    async ({ storage, objects, calls }) => {
      const writer = newWriter(storage);
      const bytes = Buffer.alloc(5 * 1024 * 1024, 0x63);
      await writer.write(bytes);
      await assert.rejects(writer.complete(),
        /S3 Complete multipart upload failed with HTTP 202/u);
      await assert.rejects(writer.complete(),
        /S3 multipart writer cannot complete after a failed operation/u);
      await writer.abort();
      assert.deepEqual(calls.map(call => call.method), ['POST', 'PUT', 'POST', 'DELETE']);
      assert.ok(calls[3].uploadId);
      assert.equal(calls.some(call => call.method === 'DELETE' && !call.uploadId), false);
      assert.deepEqual(objects.get(PATH), bytes,
        'only B80/B81 owner-fenced cleanup may remove this ambiguous committed generation');
    });
});

test('B113 signed HTTP refuses accepted-only 202 abort and retries the same upload ID', async () => {
  await withLoopback({ abortStatuses: [202, 204] },
    async ({ storage, calls, objects, uploads }) => {
      const writer = newWriter(storage);
      await writer.write(Buffer.alloc(5 * 1024 * 1024, 0x64));
      await assert.rejects(writer.abort(),
        /S3 Abort multipart upload failed with HTTP 202/u);
      assert.equal(uploads.size, 1);
      await writer.abort();
      assert.equal(uploads.size, 0);
      assert.equal(objects.size, 0);
      assert.deepEqual(calls.map(call => call.method),
        ['POST', 'PUT', 'DELETE', 'DELETE']);
      assert.ok(calls[2].uploadId);
      assert.equal(calls[2].uploadId, calls[3].uploadId);
      assert.equal(calls.some(call => call.method === 'DELETE' && !call.uploadId), false);
    });
});

test('B112 signed HTTP rejects injected content-type before any multipart request', async () => {
  for (const contentType of [
    'application/json\r\nX-Amz-Date: forged',
    'application/json\u0000override',
  ]) {
    await withLoopback({}, async ({ storage, calls, objects, uploads }) => {
      const writer = storage.createMultipartWriter({
        objectKey: OBJECT_KEY, contentType, deleteObjectOnAbort: false,
      });
      await assert.rejects(writer.write(Buffer.alloc(5 * 1024 * 1024, 0x51)),
        /S3 signed request contains an invalid or reserved header/u);
      await assert.rejects(writer.complete(),
        /S3 multipart writer cannot complete after a failed operation/u);
      await writer.abort();
      assert.deepEqual(calls, []);
      assert.equal(objects.size, 0);
      assert.equal(uploads.size, 0);
    });
  }
});

test('B112 signed HTTP preserves canonical content-type for real multipart writes', async () => {
  await withLoopback({ captureWriteHeaders: true },
    async ({ storage, calls, objects }) => {
      const writer = storage.createMultipartWriter({
        objectKey: OBJECT_KEY,
        contentType: ' application/json;   charset=utf-8 ',
        deleteObjectOnAbort: false,
      });
      const bytes = Buffer.alloc(5 * 1024 * 1024, 0x52);
      await writer.write(bytes);
      await writer.complete();
      assert.deepEqual(calls.map(call => call.method), ['POST', 'PUT', 'POST']);
      const initHeaders = calls[0].requestHeaders;
      assert.equal(initHeaders['content-type'], 'application/json; charset=utf-8');
      assert.match(initHeaders.authorization,
        /SignedHeaders=content-type;host;x-amz-content-sha256;x-amz-date,/u);
      for (const [index, call] of calls.slice(1).entries()) {
        // UploadPart and CompleteMultipartUpload sign content-type too.
        // Confirm both the canonical header value AND its SigV4 coverage.
        const expectedType = index === 0 ? 'application/octet-stream' : 'application/xml';
        assert.match(call.requestHeaders.authorization,
          /SignedHeaders=content-type;host;x-amz-content-sha256;x-amz-date,/u);
        assert.equal(call.requestHeaders['content-type'], expectedType);
      }
      assert.deepEqual(objects.get(PATH), bytes);
    });
});

test('B111 signed HTTP confirms exact byte-zero Content-Range and smaller object', async () => {
  await withLoopback({ prefixResponse: {
    contentRange: 'bytes 0-3/4', body: Buffer.from('%PDF'),
  } }, async ({ storage, calls }) => {
    const writer = newWriter(storage);
    await writer.write(Buffer.from('%PDF'));
    await writer.complete();
    assert.deepEqual(Buffer.from(await storage.readPrefix(OBJECT_KEY, 8)), Buffer.from('%PDF'));
    assert.deepEqual(calls.map(call => call.method), ['PUT', 'GET']);
    assert.equal(calls.some(call => call.method === 'DELETE'), false);
  });
});

test('B111 signed HTTP refuses foreign and truncated HTTP 206 ranges', async () => {
  for (const prefixResponse of [
    { contentRange: 'bytes 1-8/100', body: Buffer.from('12345678') },
    { contentRange: 'bytes 0-7/100', body: Buffer.from('123') },
    { contentRange: null, body: Buffer.from('12345678') },
  ]) {
    await withLoopback({ prefixResponse }, async ({ storage, objects, calls }) => {
      const writer = newWriter(storage);
      const bytes = Buffer.from('12345678');
      await writer.write(bytes);
      await writer.complete();
      await assert.rejects(storage.readPrefix(OBJECT_KEY, 8),
        /Content-Range/u);
      assert.deepEqual(objects.get(PATH), bytes);
      assert.deepEqual(calls.map(call => call.method), ['PUT', 'GET']);
      assert.equal(calls.some(call => call.method === 'DELETE'), false);
    });
  }
});

test('B110 signed HTTP binds requested Range to SigV4 and rejects tampering', async () => {
  await withLoopback({ captureGetHeaders: true },
    async ({ storage, calls, endpoint, objects }) => {
      const writer = newWriter(storage);
      const bytes = Buffer.from('%PDF-1.7');
      await writer.write(bytes);
      await writer.complete();
      assert.deepEqual(Buffer.from(await storage.readPrefix(OBJECT_KEY, 8)), bytes);
      const received = calls.find(call => call.method === 'GET');
      assert.ok(received?.requestHeaders);
      const headers = received.requestHeaders;
      assert.equal(headers.range, 'bytes=0-7');
      assert.match(headers.authorization,
        /SignedHeaders=host;range;x-amz-content-sha256;x-amz-date,/u);
      const request = {
        method: 'GET', url: new URL(received.path, endpoint),
        headers, body: Buffer.alloc(0), bucket: BUCKET, objectKey: OBJECT_KEY,
        region: 'us-east-1', accessKeyId: ACCESS_KEY_ID,
        secretAccessKey: SECRET_ACCESS_KEY, now: FIXTURE_TIME,
      };
      assert.equal(verifyB87S3SigV4(request), true);
      assert.equal(verifyB87S3SigV4({
        ...request, headers: { ...headers, range: 'bytes=1-8' },
      }), false, 'changing signed Range must invalidate request');
      const withoutRange = { ...headers };
      delete withoutRange.range;
      assert.equal(verifyB87S3SigV4({
        ...request, headers: withoutRange,
      }), false, 'removing signed Range must invalidate request');
      assert.deepEqual(objects.get(PATH), bytes);
    });
});

test('B110 signed HTTP full GET without Range preserves old SigV4 signature shape', async () => {
  await withLoopback({ captureGetHeaders: true }, async ({ storage, calls }) => {
    const writer = newWriter(storage);
    const bytes = Buffer.from('{"b110":"full"}');
    await writer.write(bytes);
    await writer.complete();
    assert.deepEqual(await getBytes(storage), bytes);
    const received = calls.find(call => call.method === 'GET');
    assert.ok(received?.requestHeaders);
    assert.equal(received.requestHeaders.range, undefined);
    assert.match(received.requestHeaders.authorization,
      /SignedHeaders=host;x-amz-content-sha256;x-amz-date,/u);
  });
});

test('B109 signed HTTP rejects ignored Range before buffering a large private object', async () => {
  await withLoopback({}, async ({ storage, calls, objects }) => {
    const writer = newWriter(storage);
    const bytes = Buffer.alloc(64 * 1024 + 1, 0x71);
    await writer.write(bytes);
    await writer.complete();
    await assert.rejects(storage.readPrefix(OBJECT_KEY, 8),
      /S3 returned more bytes than the requested prefix/u);
    assert.deepEqual(objects.get(PATH), bytes);
    assert.deepEqual(calls.map(call => call.method), ['PUT', 'GET']);
    assert.equal(calls.some(call => call.method === 'DELETE'), false);
  });
});

test('B109 signed HTTP returns exact small prefix from a compatible provider', async () => {
  await withLoopback({}, async ({ storage, calls, objects }) => {
    const writer = newWriter(storage);
    const bytes = Buffer.from('%PDF-1.7');
    await writer.write(bytes);
    await writer.complete();
    assert.deepEqual(Buffer.from(await storage.readPrefix(OBJECT_KEY, bytes.byteLength)), bytes);
    assert.deepEqual(objects.get(PATH), bytes);
    assert.deepEqual(calls.map(call => call.method), ['PUT', 'GET']);
  });
});

test('B108 signed HTTP rejects malformed UploadPart ETags with ID-only abort', async () => {
  for (const partEtag of ['"unbalanced', 'unbalanced"', 'x'.repeat(300)]) {
    await withLoopback({ partEtag }, async ({ storage, calls, objects, uploads }) => {
      const writer = newWriter(storage);
      await assert.rejects(writer.write(Buffer.alloc(5 * 1024 * 1024, 0x75)),
        /S3 multipart part returned an invalid ETag/u);
      await assert.rejects(writer.complete(),
        /S3 multipart writer cannot complete after a failed operation/u);
      await writer.abort();
      assert.deepEqual(calls.map(call => call.method), ['POST', 'PUT', 'DELETE']);
      assert.ok(calls[2].uploadId);
      assert.equal(calls.some(call => call.method === 'DELETE' && !call.uploadId), false);
      assert.equal(objects.size, 0);
      assert.equal(uploads.size, 0);
    });
  }
});

test('B108 signed HTTP supports a bounded unquoted compatible part ETag', async () => {
  await withLoopback({ partEtag: 'opaque&compatible' }, async ({ storage, calls, objects }) => {
    const writer = newWriter(storage);
    const bytes = Buffer.alloc(5 * 1024 * 1024, 0x76);
    await writer.write(bytes);
    await writer.complete();
    assert.deepEqual(calls.map(call => call.method), ['POST', 'PUT', 'POST']);
    assert.deepEqual(objects.get(PATH), bytes);
  });
});

test('B106 signed HTTP rejects oversized 16 MiB snapshot before any request', async () => {
  await withLoopback({}, async ({ storage, calls, objects }) => {
    const writer = newWriter(storage);
    await assert.rejects(writer.write(Buffer.alloc(16 * 1024 * 1024 + 1)),
      /S3 multipart writer pending writes exceed limits/u);
    await assert.rejects(writer.complete(),
      /S3 multipart writer cannot complete after a failed operation/u);
    await writer.abort();
    assert.deepEqual(calls, []);
    assert.equal(objects.size, 0);
  });
});

test('B106 signed HTTP aborts over-budget queued writes after confirmed upload ID', async () => {
  let notifyInitiation;
  const initiated = new Promise(resolve => { notifyInitiation = resolve; });
  await withLoopback({ initiationDelayMs: 80, onInitiation: () => notifyInitiation() },
    async ({ storage, calls, objects }) => {
      const writer = newWriter(storage);
      const first = writer.write(Buffer.alloc(5 * 1024 * 1024, 0x41));
      await initiated;
      const second = writer.write(Buffer.alloc(5 * 1024 * 1024, 0x42));
      const third = writer.write(Buffer.alloc(5 * 1024 * 1024, 0x43));
      const overflow = assert.rejects(writer.write(Buffer.alloc(5 * 1024 * 1024, 0x44)),
        /S3 multipart writer pending writes exceed limits/u);
      const rejectedSecond = assert.rejects(second,
        /S3 multipart writer is no longer writable/u);
      const rejectedThird = assert.rejects(third,
        /S3 multipart writer is no longer writable/u);
      const rejectedComplete = assert.rejects(writer.complete(),
        /S3 multipart writer cannot complete after a failed operation/u);
      const abort = writer.abort();
      await Promise.all([first, rejectedSecond, rejectedThird, overflow, rejectedComplete, abort]);
      assert.deepEqual(calls.map(call => call.method), ['POST', 'PUT', 'DELETE']);
      assert.ok(calls[2].uploadId);
      assert.equal(calls.some(call => call.method === 'DELETE' && !call.uploadId), false);
      assert.equal(objects.size, 0);
    });
});

test('B105 concurrent signed writes produce distinct ordered S3 parts and exact bytes', async () => {
  await withLoopback({}, async ({ storage, calls, objects }) => {
    const writer = newWriter(storage);
    const a = Buffer.alloc(5 * 1024 * 1024, 0x41);
    const b = Buffer.alloc(5 * 1024 * 1024, 0x42);
    const first = writer.write(a);
    const second = writer.write(b);
    const completion = writer.complete();
    await Promise.all([first, second, completion]);
    assert.deepEqual(calls.map(call => call.method), ['POST', 'PUT', 'PUT', 'POST']);
    assert.deepEqual(calls.filter(call => call.part).map(call => call.part), ['1', '2']);
    const bytes = objects.get(PATH);
    assert.ok(bytes);
    assert.deepEqual(bytes, Buffer.concat([a, b]));
  });
});

test('B105 signed HTTP abort cannot overtake concurrent initiation and part PUT', async () => {
  await withLoopback({ initiationDelayMs: 30 }, async ({ storage, calls, objects }) => {
    const writer = newWriter(storage);
    const writing = writer.write(Buffer.alloc(5 * 1024 * 1024, 0x43));
    const aborting = writer.abort();
    await assert.rejects(writer.complete(), /S3 multipart writer was aborted/u);
    await assert.rejects(writer.write(Buffer.from('late')),
      /S3 multipart writer is no longer writable/u);
    await Promise.all([writing, aborting]);
    assert.deepEqual(calls.map(call => call.method), ['POST', 'PUT', 'DELETE']);
    assert.ok(calls[2].uploadId);
    assert.equal(calls.some(call => call.method === 'DELETE' && !call.uploadId), false);
    assert.equal(objects.size, 0);
  });
});

test('B105 signed HTTP concurrent complete calls perform a single private PUT', async () => {
  await withLoopback({}, async ({ storage, calls, objects }) => {
    const writer = newWriter(storage);
    const bytes = Buffer.from('{"b105":"single"}');
    const writing = writer.write(bytes);
    const first = writer.complete();
    const second = writer.complete();
    await Promise.all([writing, first, second]);
    assert.deepEqual(calls.map(call => call.method), ['PUT']);
    assert.deepEqual(objects.get(PATH), bytes);
  });
});

test('B105 signed HTTP queued failure blocks completion and still aborts exact upload', async () => {
  await withLoopback({ partStatuses: [503] }, async ({ storage, calls, objects }) => {
    const writer = newWriter(storage);
    const first = writer.write(Buffer.alloc(5 * 1024 * 1024, 0x44));
    const second = writer.write(Buffer.alloc(5 * 1024 * 1024, 0x45));
    const completing = writer.complete();
    const aborting = writer.abort();
    const rejectedFirst = assert.rejects(first, /Upload multipart part failed with HTTP 503/u);
    const rejectedSecond = assert.rejects(second,
      /S3 multipart writer is no longer writable/u);
    const rejectedComplete = assert.rejects(completing,
      /S3 multipart writer cannot complete after a failed operation/u);
    await Promise.all([rejectedFirst, rejectedSecond, rejectedComplete, aborting]);
    assert.deepEqual(calls.map(call => call.method), ['POST', 'PUT', 'DELETE']);
    assert.ok(calls[2].uploadId);
    assert.equal(objects.size, 0);
  });
});

test('B104 signed HTTP failed first part forbids completion and permits uploadId-only abort', async () => {
  await withLoopback({ partStatuses: [503] }, async ({ storage, objects, calls, uploads }) => {
    const writer = newWriter(storage);
    await assert.rejects(writer.write(Buffer.alloc(5 * 1024 * 1024, 0x41)),
      /S3 Upload multipart part failed with HTTP 503/u);
    await assert.rejects(writer.complete(),
      /S3 multipart writer cannot complete after a failed operation/u);
    await assert.rejects(writer.write(Buffer.from('retry')),
      /S3 multipart writer is no longer writable/u);
    await writer.abort();
    assert.equal(objects.size, 0, 'no truncated object was committed');
    assert.equal(uploads.size, 0, 'the known multipart generation was aborted');
    assert.deepEqual(calls.map(call => call.method), ['POST', 'PUT', 'DELETE']);
    assert.ok(calls[2].uploadId);
    assert.equal(calls.some(call => call.method === 'DELETE' && !call.uploadId), false);
  });
});

test('B104 signed HTTP failed second part never confirms a first-part-only object', async () => {
  await withLoopback({ partStatuses: [200, 503] }, async ({ storage, objects, calls }) => {
    const writer = newWriter(storage);
    await writer.write(Buffer.alloc(5 * 1024 * 1024, 0x41));
    await assert.rejects(writer.write(Buffer.alloc(5 * 1024 * 1024, 0x42)),
      /S3 Upload multipart part failed with HTTP 503/u);
    await assert.rejects(writer.complete(),
      /S3 multipart writer cannot complete after a failed operation/u);
    await writer.abort();
    assert.equal(objects.size, 0, 'partial first-part upload cannot be published');
    assert.deepEqual(calls.map(call => call.method), ['POST', 'PUT', 'PUT', 'DELETE']);
    assert.ok(calls[3].uploadId);
  });
});

test('B104 signed HTTP ambiguous final ACK cannot be replayed or DELETE private object', async () => {
  await withLoopback({ completeMultipartBody: '<CompleteMultipartUploadResult/>' },
    async ({ storage, objects, calls }) => {
      const writer = newWriter(storage);
      await writer.write(Buffer.alloc(5 * 1024 * 1024, 0x43));
      await assert.rejects(writer.complete(), /S3 Complete multipart upload failed/u);
      assert.equal(objects.has(PATH), true, 'provider committed despite false ACK');
      await assert.rejects(writer.complete(),
        /S3 multipart writer cannot complete after a failed operation/u);
      await writer.abort();
      assert.equal(objects.has(PATH), true, 'owner fencing must own cleanup');
      assert.deepEqual(calls.map(call => call.method), ['POST', 'PUT', 'POST', 'DELETE']);
      assert.ok(calls[3].uploadId);
    });
});

test('B104 signed HTTP single PUT lost ACK cannot be repeated or delete private object', async () => {
  await withLoopback({ losePutAck: true }, async ({ storage, objects, calls }) => {
    const writer = newWriter(storage);
    const bytes = Buffer.from('{"private":"b104"}');
    await writer.write(bytes);
    await assert.rejects(writer.complete());
    assert.deepEqual(objects.get(PATH), bytes, 'provider may already have persisted PUT');
    await assert.rejects(writer.complete(),
      /S3 multipart writer cannot complete after a failed operation/u);
    await writer.abort();
    assert.deepEqual(objects.get(PATH), bytes);
    assert.deepEqual(calls.map(call => call.method), ['PUT']);
  });
});

test('B103 signed HTTP refuses empty success ACK and never deletes committed private generation', async () => {
  for (const completeMultipartBody of [
    '<CompleteMultipartUploadResult/>',
    '<CompleteMultipartUploadResult />',
    '<CompleteMultipartUploadResult><ETag>&#x20;</ETag></CompleteMultipartUploadResult>',
  ]) {
    await withLoopback({ completeMultipartBody }, async ({ storage, objects, calls }) => {
      const writer = newWriter(storage);
      await writer.write(Buffer.alloc(5 * 1024 * 1024, 0x73));
      await assert.rejects(writer.complete(), /Complete multipart upload/u);
      assert.equal(objects.has(PATH), true, 'provider committed bytes despite ambiguous ACK');
      await writer.abort();
      assert.equal(objects.has(PATH), true, 'private object requires owner-fenced cleanup');
      assert.deepEqual(calls.map(call => call.method), ['POST', 'PUT', 'POST', 'DELETE']);
      assert.ok(calls[3].uploadId, 'abort only the known multipart upload');
      assert.equal(calls.some(call => call.method === 'DELETE' && !call.uploadId), false);
    });
  }
});

test('B102 signed HTTP rejects foreign completion bucket/key with owner-safe multipart abort', async () => {
  for (const completeMultipartBody of [
    '<CompleteMultipartUploadResult><Bucket>other-bucket</Bucket>' +
      '<Key>' + OBJECT_KEY + '</Key><ETag>"ok"</ETag></CompleteMultipartUploadResult>',
    '<CompleteMultipartUploadResult><Bucket>' + BUCKET + '</Bucket>' +
      '<Key>exports/someone-else/private.json</Key>' +
      '<ETag>"ok"</ETag></CompleteMultipartUploadResult>',
  ]) {
    await withLoopback({ completeMultipartBody }, async ({ storage, objects, calls }) => {
      const writer = newWriter(storage);
      await writer.write(Buffer.alloc(5 * 1024 * 1024, 0x72));
      await assert.rejects(writer.complete(), /S3 Complete multipart upload/u);
      assert.equal(objects.has(PATH), true, 'simulated provider already committed bytes');
      await writer.abort();
      assert.equal(objects.has(PATH), true, 'private generation is not deleted');
      assert.deepEqual(calls.map(call => call.method), ['POST', 'PUT', 'POST', 'DELETE']);
      assert.ok(calls[3].uploadId);
      assert.equal(calls.some(call => call.method === 'DELETE' && !call.uploadId), false);
    });
  }
});

test('B99 signed HTTP rejects malformed success XML and preserves owner-fenced cleanup', async () => {
  for (const completeMultipartBody of [
    '<CompleteMultipartUploadResult><ETag>"ok"</Key></CompleteMultipartUploadResult>',
    '<CompleteMultipartUploadResult><Key>key</Key></CompleteMultipartUploadResult>',
    '<CompleteMultipartUploadResult><ETag>&unknown;</ETag></CompleteMultipartUploadResult>',
  ]) {
    await withLoopback({ completeMultipartBody }, async ({ storage, objects, calls }) => {
      const writer = newWriter(storage);
      await writer.write(Buffer.alloc(5 * 1024 * 1024, 0x66));
      await assert.rejects(writer.complete(), /Complete multipart upload/u);
      // The signed local provider committed the object before HTTP 200.
      // Only abort this multipart upload ID: never DELETE the object here.
      assert.equal(objects.has(PATH), true);
      await writer.abort();
      assert.equal(objects.has(PATH), true);
      assert.deepEqual(calls.map(call => call.method), ['POST', 'PUT', 'POST', 'DELETE']);
      assert.ok(calls[3].uploadId);
      assert.equal(calls.some(call => call.method === 'DELETE' && !call.uploadId), false);
    });
  }
});

test('B86 shared generic writer keeps the previous explicit abort cleanup default', async () => {
  await withLoopback({}, async ({ storage, calls }) => {
    const writer = storage.createMultipartWriter({
      objectKey: OBJECT_KEY, contentType: CONTENT_TYPE,
    });
    await writer.write(Buffer.alloc(5 * 1024 * 1024, 0x62));
    await writer.abort();
    assert.deepEqual(calls.map(call => call.method), ['POST', 'PUT', 'DELETE', 'DELETE']);
    assert.ok(calls[2].uploadId);
    assert.equal(calls[3].uploadId, null);
  });
});
