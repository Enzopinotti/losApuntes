import assert from 'node:assert/strict';
import test from 'node:test';
import { expectedS3PrefixBytes as expected } from
  '../apps/api/src/files/storage/s3-prefix-content-range.ts';
import { readBoundedS3PrefixBody as read } from
  '../apps/api/src/files/storage/s3-bounded-prefix-body.ts';

const bytes = s => new TextEncoder().encode(s);
const response206 = (s, range) => new Response(bytes(s), {
  status: 206, headers: { 'content-range': range },
});

test('B111 HTTP 206 accepts exactly the requested first bytes', async () => {
  assert.equal(expected(206, 'bytes 0-7/20', 8), 8);
  assert.deepEqual(await read(response206('%PDF-1.7', 'bytes 0-7/20'), 8),
    bytes('%PDF-1.7'));
});

test('B111 accepts a shorter complete object with correct Content-Range', async () => {
  assert.equal(expected(206, 'bytes 0-3/4', 8), 4);
  assert.deepEqual(await read(response206('%PDF', 'bytes 0-3/4'), 8),
    bytes('%PDF'));
});

test('B111 HTTP 200 full-object compatibility remains bounded', async () => {
  assert.equal(expected(200, null, 8), null);
  assert.deepEqual(await read(new Response(bytes('%PDF')), 8), bytes('%PDF'));
  await assert.rejects(read(new Response(bytes('123456789')), 8),
    /more bytes than the requested prefix/u);
  assert.deepEqual(await read(new Response(null, { status: 200 }), 8),
    new Uint8Array());
});

test('B111 rejects a different start offset or truncated remote window', async () => {
  for (const range of [
    'bytes 1-8/100', 'bytes 0-3/100', 'bytes 0-8/100',
    'bytes 0-7/7', 'bytes 1-7/100',
  ]) assert.throws(() => expected(206, range, 8),
    /mismatched Content-Range/u, range);
});

test('B111 rejects missing, unknown-size, unsafe and malformed range metadata', async () => {
  for (const range of [
    null, '', 'bytes */100', 'bytes 0-7/*', 'Bytes 0-7/100',
    'bytes 00-7/100', 'bytes 0-07/100',
    'bytes 0-7/9007199254740993', 'bytes -1-7/100',
    'bytes 0-7/100\r\nX-Test: 1',
  ]) assert.throws(() => expected(206, range, 8), /Content-Range/u, String(range));
  for (const status of [201, 202, 204, 205]) {
    assert.throws(() => expected(status, null, 8), /unexpected successful status/u);
  }
});

test('B111 rejects provider body shorter than declared 206 Content-Range', async () => {
  await assert.rejects(read(response206('abc', 'bytes 0-7/100'), 8),
    /truncated Content-Range body/u);
});

test('B111 rejects 206 without body and preserves 200 empty response', async () => {
  await assert.rejects(read(new Response(null, {
    status: 206, headers: { 'content-range': 'bytes 0-7/100' },
  }), 8), /truncated Content-Range body/u);
  assert.deepEqual(await read(new Response(null, { status: 200 }), 8),
    new Uint8Array());
});

test('B111 invalid Content-Range cancels upstream stream before reading data', async () => {
  let cancelled = 0;
  const body = new ReadableStream({
    start(controller) { controller.enqueue(bytes('abcdef')); },
    cancel() { cancelled++; },
  });
  await assert.rejects(read({ body, status: 206,
    headers: new Headers({ 'content-range': 'bytes 1-6/100' }) }, 8),
  /mismatched Content-Range/u);
  assert.equal(cancelled, 1);
});

test('B111 206 with incomplete stream cancels cleanup and fails closed', async () => {
  const body = new ReadableStream({
    start(controller) { controller.enqueue(bytes('123')); controller.close(); },
  });
  await assert.rejects(read({
    body, status: 206, headers: new Headers({ 'content-range': 'bytes 0-7/100' }),
  }, 8), /truncated Content-Range body/u);
});

test('B111 metadata cannot bypass existing maximumBytes stream ceiling', async () => {
  await assert.rejects(read(response206('123456789', 'bytes 0-7/100'), 8),
    /more bytes than the requested prefix/u);
});
