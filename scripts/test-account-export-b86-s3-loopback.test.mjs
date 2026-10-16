import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { createServer } from 'node:http';
import test from 'node:test';

import { createS3ObjectStorage } from '../apps/api/src/files/storage/s3-object-storage.ts';
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
        response.end(`<InitiateMultipartUploadResult><UploadId>${id}</UploadId></InitiateMultipartUploadResult>`);
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
          response.end('<CompleteMultipartUploadResult />');
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
        if (!obj) { response.writeHead(404); response.end(); return; }
        response.writeHead(200, { 'content-type': CONTENT_TYPE });
        response.end(obj);
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
