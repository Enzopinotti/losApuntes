import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import test from 'node:test';

import {
  MAX_S3_MULTIPART_COMPLETION_BYTES as LIMIT,
  readBoundedS3MultipartCompletionXml as readXml,
} from '../apps/api/src/files/storage/s3-multipart-response-body.ts';

const valid = '<CompleteMultipartUploadResult><ETag>"ok"</ETag></CompleteMultipartUploadResult>';

function stream(chunks, onCancel = () => {}) {
  let index = 0;
  return new ReadableStream({
    pull(controller) {
      if (index < chunks.length) controller.enqueue(chunks[index++]);
      else controller.close();
    },
    cancel: onCancel,
  }, { highWaterMark: 0 });
}

test('B97 reads normal signed S3 completion XML in multiple UTF-8 chunks', async () => {
  const bytes = Buffer.from(valid);
  const result = await readXml({ body: stream([
    bytes.subarray(0, 9),
    bytes.subarray(9, 37),
    bytes.subarray(37),
  ]) });
  assert.equal(result, valid);
});

test('B97 accepts exactly 65536 response bytes without truncation', async () => {
  const bytes = Buffer.alloc(LIMIT, 0x41);
  const received = await readXml({ body: stream([
    bytes.subarray(0, 100),
    bytes.subarray(100),
  ]) });
  assert.equal(received.length, LIMIT);
});

test('B97 stops and cancels a first overlong provider chunk', async () => {
  let canceled = 0;
  let pulled = 0;
  const body = new ReadableStream({
    pull(controller) {
      pulled++;
      controller.enqueue(Buffer.alloc(LIMIT + 1));
    },
    cancel() { canceled++; },
  }, { highWaterMark: 0 });
  await assert.rejects(readXml({ body }), /exceeds 65536 bytes/u);
  assert.equal(pulled, 1);
  assert.equal(canceled, 1);
});

test('B97 rejects a split overflow at the exact 64 KiB boundary', async () => {
  let canceled = 0;
  await assert.rejects(readXml({ body: stream([
    Buffer.alloc(LIMIT - 1, 0x41), Buffer.from('XY'),
  ], () => { canceled++; }) }), /exceeds 65536 bytes/u);
  assert.equal(canceled, 1);
});

test('B97 fails closed on missing response body', async () => {
  await assert.rejects(readXml({ body: null }), /body is missing/u);
});

test('B97 rejects invalid UTF-8 rather than silently repairing S3 XML', async () => {
  let canceled = false;
  await assert.rejects(readXml({ body: stream([
    Buffer.from([0xc3, 0x28]),
  ], () => { canceled = true; }) }), /encoded data|UTF-8|encoding/u);
  assert.equal(canceled, true);
});

test('B97 handles multi-byte UTF-8 split across TCP frames', async () => {
  const utf8 = Buffer.from('áñ€', 'utf8');
  const chunks = [...utf8].map(value => Uint8Array.of(value));
  assert.equal(await readXml({ body: stream(chunks) }), 'áñ€');
});

test('B97 preserves the upstream stream failure and cancels the reader', async () => {
  const body = new ReadableStream({
    start(controller) {
      controller.enqueue(Buffer.from('partial'));
      controller.error(new Error('signed S3 stream broke'));
    },
  });
  await assert.rejects(readXml({ body }), /signed S3 stream broke/u);
});

test('B97 cancellation failure cannot conceal the size violation', async () => {
  const body = new ReadableStream({
    start(controller) { controller.enqueue(Buffer.alloc(LIMIT + 1)); },
    cancel() { throw new Error('provider cancel rejected'); },
  });
  await assert.rejects(readXml({ body }), /exceeds 65536 bytes/u);
});

test('B97 rejects a provider stream with non-binary data', async () => {
  await assert.rejects(readXml({ body: stream(['bad bytes']) }),
    /returned invalid bytes/u);
});

test('B97 rejects an incomplete trailing UTF-8 sequence', async () => {
  await assert.rejects(readXml({ body: stream([Uint8Array.of(0xe2)]) }),
    /encoded data|UTF-8|encoding/u);
});

test('B97 real localhost HTTP 200 oversized XML is rejected before buffering full body', async () => {
  const server = createServer((_request, response) => {
    response.writeHead(200, { 'content-type': 'application/xml' });
    response.write(Buffer.alloc(63 * 1024, 0x41));
    response.end(Buffer.alloc(2048, 0x42));
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  try {
    const address = server.address();
    assert.ok(address && typeof address !== 'string');
    const response = await fetch('http://127.0.0.1:' + address.port);
    assert.equal(response.status, 200);
    await assert.rejects(readXml(response), /exceeds 65536 bytes/u);
  } finally {
    await new Promise(resolve => server.close(resolve));
  }
});
