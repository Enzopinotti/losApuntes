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
  const server = createServer(async (request, response) => {
    const url = new URL(request.url ?? '/', 'http://127.0.0.1');
    const method = request.method ?? '';
    const bytes = [];
    try {
      for await (const chunk of request) bytes.push(Buffer.from(chunk));
      const body = Buffer.concat(bytes);
      const uploadId = url.searchParams.get('uploadId');
      const part = url.searchParams.get('partNumber');
      calls.push({ method, path: url.pathname, uploadId, part, bytes: body.length });
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
        const id = randomUUID();
        uploads.set(id, []);
        response.writeHead(200, { 'content-type': 'application/xml' });
        response.end(input.initiateMultipartBody ?? `<InitiateMultipartUploadResult><UploadId>${id}</UploadId></InitiateMultipartUploadResult>`);
      } else if (method === 'PUT' && uploadId && part) {
        const upload = uploads.get(uploadId);
        if (!upload) { response.writeHead(404); response.end(); return; }
        upload[Number(part) - 1] = body;
        response.writeHead(200, { etag: '"b86-part-etag"' });
        response.end();
      } else if (method === 'POST' && uploadId) {
        const upload = uploads.get(uploadId);
        if (!upload) { response.writeHead(404); response.end(); return; }
        objects.set(url.pathname, Buffer.concat(upload));
        uploads.delete(uploadId);
        if (input.loseMultipartAck) {
          response.destroy();
        } else {
          response.writeHead(200, { 'content-type': 'application/xml' });
          response.end(input.completeMultipartBody ?? '<CompleteMultipartUploadResult />');
        }
      } else if (method === 'PUT' && !uploadId) {
        objects.set(url.pathname, body);
        if (input.losePutAck) response.destroy();
        else { response.writeHead(200); response.end(); }
      } else if (method === 'DELETE' && uploadId) {
        uploads.delete(uploadId);
        response.writeHead(204); response.end();
      } else if (method === 'DELETE') {
        if (failDelete > 0) {
          failDelete -= 1;
          response.writeHead(503); response.end();
        } else {
          objects.delete(url.pathname);
          response.writeHead(204); response.end();
        }
      } else if (method === 'GET') {
        const obj = objects.get(url.pathname);
        const fault = getFaults.shift() ?? 'healthy';
        if (fault === '503') {
          response.writeHead(503); response.end(); return;
        }
        if (fault === '404' || !obj) {
          response.writeHead(404); response.end(); return;
        }
        const delivered = Buffer.from(obj);
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
        response.writeHead(200, { 'content-type': CONTENT_TYPE });
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
    '<Location>https://s3.local/bucket/key</Location><Bucket>bucket</Bucket>' +
    '<Key>key</Key><ETag>"etag"</ETag></CompleteMultipartUploadResult>';
  await withLoopback({ completeMultipartBody }, async ({ storage, objects, calls }) => {
    const writer = newWriter(storage);
    await writer.write(Buffer.alloc(5 * 1024 * 1024, 0x65));
    await assert.doesNotReject(writer.complete());
    assert.equal(objects.has(PATH), true);
    assert.deepEqual(calls.map(call => call.method), ['POST', 'PUT', 'POST']);
  });
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
