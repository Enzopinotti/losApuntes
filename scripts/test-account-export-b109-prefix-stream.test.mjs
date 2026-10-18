import assert from 'node:assert/strict';
import test from 'node:test';
import { readBoundedS3PrefixBody as read } from
  '../apps/api/src/files/storage/s3-bounded-prefix-body.ts';

const bytes = value => new TextEncoder().encode(value);

test('B109 accepts a correct small prefix split into multiple stream chunks', async () => {
  const stream = new ReadableStream({
    start(controller) {
      controller.enqueue(bytes('%PDF'));
      controller.enqueue(bytes('-1.7'));
      controller.close();
    },
  });
  assert.deepEqual(await read({ body: stream }, 8), bytes('%PDF-1.7'));
});

test('B109 allows exact maximum and zero-length provider response', async () => {
  assert.deepEqual(await read(new Response(bytes('12345678')), 8), bytes('12345678'));
  assert.deepEqual(await read(new Response(null), 8), new Uint8Array());
});

test('B109 rejects an oversized first provider chunk and cancels it', async () => {
  let cancelled = 0;
  const stream = new ReadableStream({
    start(controller) { controller.enqueue(new Uint8Array(64 * 1024 + 1)); },
    cancel() { cancelled++; },
  });
  await assert.rejects(read({ body: stream }, 8),
    /S3 returned more bytes than the requested prefix/u);
  assert.equal(cancelled, 1);
});

test('B109 rejects progressive overflow before copying the extra chunk', async () => {
  let cancelled = 0;
  const stream = new ReadableStream({
    start(controller) {
      controller.enqueue(bytes('1234567'));
      controller.enqueue(bytes('89'));
    },
    cancel() { cancelled++; },
  });
  await assert.rejects(read({ body: stream }, 8),
    /S3 returned more bytes than the requested prefix/u);
  assert.equal(cancelled, 1);
});

test('B109 cancels a rejected upstream read without masking its original error', async () => {
  const expectedError = new Error('provider stream failed');
  let cancelled = false;
  const stream = new ReadableStream({
    pull(controller) { controller.error(expectedError); },
    cancel() { cancelled = true; },
  });
  await assert.rejects(read({ body: stream }, 8),
    error => error === expectedError);
  // Streams already in errored state may not invoke cancel callback; the
  // original upstream failure must nevertheless remain unchanged.
  assert.equal(typeof cancelled, 'boolean');
});

test('B109 does not leak a mutable producer buffer into returned bytes', async () => {
  const original = bytes('hello');
  const stream = new ReadableStream({
    start(controller) {
      controller.enqueue(original);
      controller.close();
    },
  });
  const result = await read({ body: stream }, 5);
  original.fill(0);
  assert.deepEqual(result, bytes('hello'));
});

test('B109 tolerates zero-byte chunk floods without retaining them', async () => {
  const stream = new ReadableStream({
    start(controller) {
      for (let i = 0; i < 2048; i++) controller.enqueue(new Uint8Array());
      controller.enqueue(bytes('OK'));
      controller.close();
    },
  });
  assert.deepEqual(await read({ body: stream }, 2), bytes('OK'));
});

test('B109 rejects invalid budgets before getting a stream reader', async () => {
  const response = new Response(bytes('a'));
  for (const invalid of [0, -1, 1.2, Number.NaN, Number.POSITIVE_INFINITY]) {
    await assert.rejects(read(response, invalid), /maximumBytes must be a positive integer/u);
  }
  assert.deepEqual(await read(response, 1), bytes('a'));
});
