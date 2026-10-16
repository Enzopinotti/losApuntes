import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';

import { verifyAccountExportStoredBytes } from '../apps/api/src/data-lifecycle/domain/account-export-artifact-readback.ts';

const data = Buffer.from('{"export":"private","sections":30}');
const digest = b => createHash('sha256').update(b).digest('hex');
const expected = { byteLength: data.length, sha256: digest(data) };
const stream = async function* (...parts) {
  for (const part of parts) yield part;
};

test('B90 exact S3 bytes from a streamed GET are authorized before publish', async () => {
  await assert.doesNotReject(verifyAccountExportStoredBytes(
    stream(data.subarray(0, 7), data.subarray(7, 16), data.subarray(16)), expected,
  ));
});

test('B90 detects S3 GET returning no bytes after a successful PUT', async () => {
  await assert.rejects(
    verifyAccountExportStoredBytes(stream(), expected),
    /byte length mismatch/u,
  );
});

test('B90 rejects a truncated GET, even when S3 returned status 200', async () => {
  await assert.rejects(
    verifyAccountExportStoredBytes(stream(data.subarray(0, data.length - 1)), expected),
    /byte length mismatch/u,
  );
});

test('B90 rejects a full-sized but corrupted object by SHA-256', async () => {
  const corrupt = Buffer.from(data);
  corrupt[6] ^= 0x01;
  assert.equal(corrupt.length, data.length);
  await assert.rejects(
    verifyAccountExportStoredBytes(stream(corrupt), expected),
    /SHA-256 mismatch/u,
  );
});

test('B90 rejects oversized S3 GET before processing remaining stream', async () => {
  let consumed = 0;
  const body = async function* () {
    consumed++;
    yield Buffer.alloc(data.length + 1);
    consumed++;
    yield data;
  };
  await assert.rejects(
    verifyAccountExportStoredBytes(body(), expected),
    /exceeds expected byte length/u,
  );
  assert.equal(consumed, 1);
});

test('B90 rejects malformed metadata before fetching any chunks', async () => {
  for (const bad of [
    { byteLength: 0, sha256: digest(data) },
    { byteLength: NaN, sha256: digest(data) },
    { byteLength: Infinity, sha256: digest(data) },
    { byteLength: data.length + 0.5, sha256: digest(data) },
    { byteLength: data.length, sha256: 'abc' },
    { byteLength: data.length, sha256: undefined },
  ]) {
    let consumed = 0;
    const body = async function* () { consumed++; yield data; };
    await assert.rejects(
      verifyAccountExportStoredBytes(body(), bad),
      /expected metadata is invalid/u,
    );
    assert.equal(consumed, 0);
  }
});

test('B90 rejects corrupt provider chunks without publishing', async () => {
  await assert.rejects(
    verifyAccountExportStoredBytes(stream('not bytes'), expected),
    /returned invalid bytes/u,
  );
});

test('B90 propagates GET errors and never infers successful readback', async () => {
  const body = async function* () {
    yield data.subarray(0, 5);
    throw new Error('S3 read stream failed');
  };
  await assert.rejects(
    verifyAccountExportStoredBytes(body(), expected),
    /S3 read stream failed/u,
  );
});

test('B90 a valid empty intermediate chunk does not change the digest', async () => {
  await assert.doesNotReject(
    verifyAccountExportStoredBytes(stream(data.subarray(0, 7), Buffer.alloc(0),
      data.subarray(7)), expected),
  );
});
