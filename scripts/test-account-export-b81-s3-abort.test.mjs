import assert from 'node:assert/strict';
import test from 'node:test';

import { createS3ObjectStorage } from '../apps/api/src/files/storage/s3-object-storage.ts';

const objectKey = 'exports/11111111-1111-4111-8111-111111111111/22222222-2222-4222-8222-222222222222.json';
const makeStorage = () => createS3ObjectStorage({
  endpoint: 'http://s3.private:9000',
  bucket: 'private-export',
  region: 'us-east-1',
  accessKeyId: 'testing',
  secretAccessKey: 'testing-only',
  now: () => new Date('2026-10-16T12:00:00.000Z'),
  configurationPrefix: 'ACCOUNT_EXPORT_S3',
});
const writerInput = {
  objectKey, contentType: 'application/json; charset=utf-8',
};
const confirmedInitiationXml = (uploadId) =>
  '<InitiateMultipartUploadResult><Bucket>private-export</Bucket>' +
  '<Key>' + objectKey + '</Key><UploadId>' + uploadId +
  '</UploadId></InitiateMultipartUploadResult>';

async function mockedFetch(handler, run) {
  const original = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (input, init) => {
    const url = new URL(String(input));
    const method = init?.method;
    calls.push({ url, method });
    return handler(calls.length, url, method);
  };
  try {
    await run(calls);
  } finally {
    globalThis.fetch = original;
  }
}

test('B81 single-part lost ACK: private abort does not DELETE a possibly committed object', async () => {
  await mockedFetch((call, _url, method) => {
    if (call === 1) {
      assert.equal(method, 'PUT');
      throw new Error('lost PUT response');
    }
    assert.equal(method, 'DELETE');
    return new Response(null, { status: 204 });
  }, async (calls) => {
    const storage = makeStorage();
    const writer = storage.createMultipartWriter({
      ...writerInput, deleteObjectOnAbort: false,
    });
    await writer.write(Buffer.from('private data'));
    await assert.rejects(writer.complete(), /lost PUT response/u);
    await writer.abort();
    assert.deepEqual(calls.map(x => x.method), ['PUT']);
    await assert.rejects(writer.write(Buffer.from('extra')), /no longer writable/u);
    await storage.deleteObject(objectKey);
    assert.deepEqual(calls.map(x => x.method), ['PUT', 'DELETE']);
    assert.equal(calls[1].url.search, '');
  });
});

test('B81 multipart completion lost ACK: abort only cancels uploadId, not object key', async () => {
  await mockedFetch((call, _url, method) => {
    if (call === 1) {
      assert.equal(method, 'POST');
      return new Response(confirmedInitiationXml('private-u1'), { status: 200 });
    }
    if (call === 2) {
      assert.equal(method, 'PUT');
      return new Response(null, { status: 200, headers: { etag: '"etag-1"' } });
    }
    if (call === 3) {
      assert.equal(method, 'POST');
      throw new Error('lost CompleteMultipartUpload response');
    }
    assert.equal(method, 'DELETE');
    return new Response(null, { status: 204 });
  }, async (calls) => {
    const writer = makeStorage().createMultipartWriter({
      ...writerInput, deleteObjectOnAbort: false,
    });
    await writer.write(Buffer.alloc(5 * 1024 * 1024, 0x61));
    await assert.rejects(writer.complete(), /lost CompleteMultipartUpload/u);
    await writer.abort();
    await writer.abort();
    assert.deepEqual(calls.map(x => x.method), ['POST', 'PUT', 'POST', 'DELETE']);
    assert.equal(calls[3].url.searchParams.get('uploadId'), 'private-u1');
    assert.equal(calls.filter(x => x.method === 'DELETE' && !x.url.searchParams.has('uploadId')).length, 0);
  });
});

test('B81 default S3 consumer still deletes object when aborting multipart writer', async () => {
  await mockedFetch((call, _url, method) => {
    if (call === 1) {
      assert.equal(method, 'POST');
      return new Response(confirmedInitiationXml('files-u1'), { status: 200 });
    }
    if (call === 2) {
      assert.equal(method, 'PUT');
      return new Response(null, { status: 200, headers: { etag: '"etag-2"' } });
    }
    return new Response(null, { status: 204 });
  }, async (calls) => {
    const writer = makeStorage().createMultipartWriter(writerInput);
    await writer.write(Buffer.alloc(5 * 1024 * 1024, 0x62));
    await writer.abort();
    assert.deepEqual(calls.map(x => x.method), ['POST', 'PUT', 'DELETE', 'DELETE']);
    assert.equal(calls[2].url.searchParams.get('uploadId'), 'files-u1');
    assert.equal(calls[3].url.search, '');
  });
});

test('B81 active private multipart can be aborted with no naked object DELETE', async () => {
  await mockedFetch((call, _url, method) => {
    if (call === 1) return new Response(confirmedInitiationXml('private-u2'), { status: 200 });
    if (call === 2) return new Response(null, { status: 200, headers: { etag: '"etag-3"' } });
    assert.equal(method, 'DELETE');
    return new Response(null, { status: 204 });
  }, async (calls) => {
    const writer = makeStorage().createMultipartWriter({
      ...writerInput, deleteObjectOnAbort: false,
    });
    await writer.write(Buffer.alloc(5 * 1024 * 1024, 0x63));
    await writer.abort();
    assert.deepEqual(calls.map(x => x.method), ['POST', 'PUT', 'DELETE']);
    assert.equal(calls[2].url.searchParams.get('uploadId'), 'private-u2');
  });
});
