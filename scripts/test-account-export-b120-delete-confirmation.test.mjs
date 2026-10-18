import assert from 'node:assert/strict';
import test from 'node:test';
import { isConfirmedS3ObjectDelete as confirmed } from
  '../apps/api/src/files/storage/s3-write-ack-status.ts';

test('B120 accepts terminal S3 DeleteObject acknowledgements', () => {
  for (const status of [200, 204, 404]) {
    assert.equal(confirmed(status), true, 'status=' + status);
  }
});

test('B120 refuses 202 Accepted and 206 Partial Content as delete confirmation', () => {
  for (const status of [202, 206]) {
    assert.equal(confirmed(status), false, 'status=' + status);
  }
});

test('B120 refuses any other informational or incomplete successful status', () => {
  for (const status of [100, 101, 201, 203, 205, 207, 208, 226, 300, 301]) {
    assert.equal(confirmed(status), false, 'status=' + status);
  }
});

test('B120 refuses transient provider and authorization errors', () => {
  for (const status of [400, 401, 403, 409, 429, 500, 503, 504]) {
    assert.equal(confirmed(status), false, 'status=' + status);
  }
});

test('B120 never treats invalid or non-integer HTTP response status as confirmation', () => {
  for (const status of [NaN, Infinity, -1, 0, 200.5]) {
    assert.equal(confirmed(status), false, 'status=' + status);
  }
});
