import assert from 'node:assert/strict';
import test from 'node:test';
import {
  assertS3FullObjectReadActive as ensureActive,
  isConfirmedS3FullObjectGet as confirmed,
} from '../apps/api/src/files/storage/s3-full-object-read-contract.ts';

test('B114 accepts full S3 GET only on exact HTTP 200', () => {
  assert.equal(confirmed(200), true);
  for (const status of [0, 199, 201, 202, 204, 206, 207, 299, 304, 403, 500]) {
    assert.equal(confirmed(status), false, String(status));
  }
});

test('B114 rejects 206 even when it carries apparently valid file bytes', () => {
  const response = new Response(new TextEncoder().encode('%PDF-1.7'), {
    status: 206, headers: { 'content-range': 'bytes 0-7/100' },
  });
  assert.equal(response.ok, true);
  assert.equal(confirmed(response.status), false);
});

test('B114 rejects 202 accepted as evidence of a full committed object', () => {
  const response = new Response(null, { status: 202 });
  assert.equal(response.ok, true);
  assert.equal(confirmed(response.status), false);
});

test('B114 signal cancellation becomes AbortError, not a successful EOF', () => {
  const controller = new AbortController();
  ensureActive(controller.signal);
  controller.abort();
  assert.throws(() => ensureActive(controller.signal), error =>
    error instanceof DOMException && error.name === 'AbortError');
});

test('B114 cancellation is authoritative even with a non-Error reason', () => {
  for (const reason of ['cancelled', 7, null]) {
    const controller = new AbortController();
    controller.abort(reason);
    assert.throws(() => ensureActive(controller.signal), error =>
      error instanceof DOMException && error.name === 'AbortError');
  }
});

test('B114 no-signal and active signals never block healthy read', () => {
  ensureActive(undefined);
  const controller = new AbortController();
  ensureActive(controller.signal);
  assert.equal(confirmed(200), true);
});

test('B114 non-status values cannot bypass full-object contract', () => {
  for (const status of [NaN, Infinity, -Infinity, 200.1, -1, '200', null]) {
    assert.equal(confirmed(status), false);
  }
});
