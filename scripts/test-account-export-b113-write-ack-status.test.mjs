import assert from 'node:assert/strict';
import test from 'node:test';
import {
  isConfirmedS3WriteAcknowledgement as writeAck,
  isConfirmedS3MultipartAbort as abortAck,
} from '../apps/api/src/files/storage/s3-write-ack-status.ts';

test('B113 requires HTTP 200 for ordinary PutObject', () => {
  assert.equal(writeAck(200), true);
  for (const status of [0, 199, 201, 202, 204, 206, 207, 226, 299, 304, 403, 500]) {
    assert.equal(writeAck(status), false, 'status ' + status);
  }
});

test('B113 forbids 202 Accepted as evidence that bytes were committed', () => {
  assert.equal(new Response(null, { status: 202 }).ok, true,
    'fetch Response.ok alone previously accepted 202');
  assert.equal(writeAck(202), false);
});

test('B113 forbids HTTP 204 success without a completed PutObject ACK', () => {
  assert.equal(new Response(null, { status: 204 }).ok, true);
  assert.equal(writeAck(204), false);
});

test('B113 forbids HTTP 206 from being mistaken for UploadPart success', () => {
  const response = new Response(null, {
    status: 206, headers: { ETag: '"a-part"' },
  });
  assert.equal(response.ok, true);
  assert.equal(writeAck(response.status), false,
    'a syntactically valid ETag must not rescue a partial response');
});

test('B113 requires exact 200 on multipart initiation and completion', () => {
  for (const operation of ['CreateMultipartUpload', 'CompleteMultipartUpload']) {
    for (const status of [201, 202, 204, 206]) {
      assert.equal(writeAck(status), false, operation + '/' + status);
    }
    assert.equal(writeAck(200), true, operation);
  }
});

test('B113 retains idempotent multipart abort statuses separate from writes', () => {
  assert.equal(abortAck(204), true);
  assert.equal(abortAck(200), true);
  assert.equal(abortAck(404), true);
  assert.equal(writeAck(204), false, '204 is abort success, not a data write ACK');
});

test('B113 abort must not report success on an asynchronous accepted-only status', () => {
  for (const status of [201, 202, 206, 207, 299, 400, 409, 500]) {
    assert.equal(abortAck(status), false, 'abort status ' + status);
  }
});

test('B113 malformed and non-integer statuses never become successful writes', () => {
  for (const status of [NaN, Infinity, -Infinity, 200.1, -1, 2000]) {
    assert.equal(writeAck(status), false);
    assert.equal(abortAck(status), false);
  }
});
