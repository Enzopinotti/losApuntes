import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import test from 'node:test';
import { parseConfirmedS3MultipartUploadId as parse } from '../apps/api/src/files/storage/s3-multipart-initiation.ts';
import {
  readBoundedS3MultipartInitiationXml as read,
  readBoundedS3MultipartCompletionXml as readCompletion,
} from '../apps/api/src/files/storage/s3-multipart-response-body.ts';

const fixture = id =>
  '<InitiateMultipartUploadResult><UploadId>' + id +
  '</UploadId></InitiateMultipartUploadResult>';

test('B100 confirms normal S3 initiation, namespace and escaped opaque UploadId', () => {
  assert.equal(parse(fixture('upload-100._+~=/')), 'upload-100._+~=/');
  assert.equal(parse('<?xml version="1.0" encoding="UTF-8"?>' +
    '<InitiateMultipartUploadResult xmlns="http://s3.amazonaws.com/doc/2006-03-01/">' +
    '<Bucket>bucket</Bucket><Key>exports/private.json</Key>' +
    '<UploadId>a&amp;b&#43;c</UploadId></InitiateMultipartUploadResult>',
    { bucket: 'bucket', objectKey: 'exports/private.json' }), 'a&b+c');
});

test('B100 rejects forged HTTP 200 response, wrong root, duplicate and absent UploadId', () => {
  for (const xml of [
    '', '<html><UploadId>forged</UploadId></html>',
    '<Error><UploadId>forged</UploadId></Error>',
    '<CompleteMultipartUploadResult><UploadId>forged</UploadId></CompleteMultipartUploadResult>',
    '<InitiateMultipartUploadResult/>',
    '<InitiateMultipartUploadResult><Key>x</Key></InitiateMultipartUploadResult>',
    '<InitiateMultipartUploadResult><UploadId>a</UploadId><UploadId>b</UploadId></InitiateMultipartUploadResult>',
    fixture('a') + '<UploadId>extra</UploadId>',
    '<InitiateMultipartUploadResult><UploadId>x</Key></InitiateMultipartUploadResult>',
    '<InitiateMultipartUploadResult><UploadId>x</UploadId><Error>bad</Error></InitiateMultipartUploadResult>',
    '<!DOCTYPE x>' + fixture('x'),
  ]) assert.equal(parse(xml), null, xml);
});

test('B100 validates XML entities and rejects control or dangerous upload IDs', () => {
  for (const id of [
    '', ' ', 'a b', 'a\nb', 'a\r\nb', '&unknown;', '&amp',
    '&#0;', '&#xD800;', '&#x110000;', '\u0000', '\ud800',
    'a'.repeat(2049),
  ]) assert.equal(parse(fixture(id)), null, JSON.stringify(id));
  assert.equal(parse(fixture('a&amp;b')), 'a&b');
});

test('B100 rejects an initiation UploadId bound to another bucket or object key', () => {
  const result = '<InitiateMultipartUploadResult><Bucket>wrong</Bucket>' +
    '<Key>exports/other.json</Key><UploadId>id</UploadId></InitiateMultipartUploadResult>';
  assert.equal(parse(result, { bucket: 'expected', objectKey: 'exports/ours.json' }), null);
  assert.equal(parse(fixture('id'), { bucket: 'expected', objectKey: 'exports/ours.json' }), 'id');
});

test('B100 supports incremental initiation XML and preserves completion API', async () => {
  const bytes = Buffer.from(fixture('split-100'));
  const body = new ReadableStream({
    start(controller) {
      controller.enqueue(bytes.subarray(0, 7));
      controller.enqueue(bytes.subarray(7, 30));
      controller.enqueue(bytes.subarray(30));
      controller.close();
    },
  });
  assert.equal(parse(await read({ body })), 'split-100');
  assert.equal(await readCompletion({ body: new Response('ok').body }), 'ok');
});

test('B100 stops before storing oversized initiation response and cancels reader', async () => {
  let cancelled = 0;
  const body = new ReadableStream({
    start(controller) { controller.enqueue(Buffer.alloc(65537, 65)); },
    cancel() { cancelled++; },
  });
  await assert.rejects(read({ body }), /S3 multipart initiation response exceeds 65536 bytes/u);
  assert.equal(cancelled, 1);
});

test('B100 fails closed on invalid UTF-8 and no response body', async () => {
  await assert.rejects(read({ body: null }), /initiation response body is missing/u);
  await assert.rejects(read({ body: new Response(Buffer.from([0xc3, 0x28])).body }),
    /encoded data|UTF-8|encoding/u);
});

test('B100 localhost HTTP 200 overlong initiation cannot become UploadId', async () => {
  const server = createServer((_req, response) => {
    response.writeHead(200, { 'content-type': 'application/xml' });
    response.end('x'.repeat(65537));
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  try {
    const address = server.address();
    assert.ok(address && typeof address !== 'string');
    const response = await fetch('http://127.0.0.1:' + address.port);
    assert.equal(response.status, 200);
    await assert.rejects(read(response), /initiation response exceeds 65536 bytes/u);
  } finally {
    await new Promise(resolve => server.close(resolve));
  }
});

test('B100 accepts exactly 65536 raw bytes for reader, but never for invalid XML', async () => {
  const response = new Response(Buffer.alloc(65536, 65));
  const xml = await read(response);
  assert.equal(xml.length, 65536);
  assert.equal(parse(xml), null);
});
