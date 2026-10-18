import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';

import { collectS3SignedRequestHeaders as signed } from
  '../apps/api/src/files/storage/s3-signed-request-headers.ts';

const now = '20261017T210000Z';
const sha = data => createHash('sha256').update(data).digest('hex');
const headers = (body, extras = {}) =>
  signed('127.0.0.1:9000', sha(body), now, extras);

test('B112 multipart POST signs content-type and original request payload digest', () => {
  const h = headers(Buffer.from('{"hello":true}'),
    { 'content-type': ' application/json;   charset=utf-8 ' });
  assert.equal(h.get('content-type'), 'application/json; charset=utf-8');
  assert.equal(h.get('x-amz-content-sha256'), sha('{"hello":true}'));
  assert.equal([...h.keys()].sort().join(';'),
    'content-type;host;x-amz-content-sha256;x-amz-date');
});

test('B112 PUT part signs the real body hash with no content-type when omitted', () => {
  const a = headers(Buffer.from('part-A'));
  const b = headers(Buffer.from('part-B'));
  assert.equal(a.get('host'), '127.0.0.1:9000');
  assert.equal(a.get('x-amz-date'), now);
  assert.equal(a.has('content-type'), false);
  assert.notEqual(a.get('x-amz-content-sha256'), b.get('x-amz-content-sha256'));
  assert.equal([...a.keys()].sort().join(';'),
    'host;x-amz-content-sha256;x-amz-date');
});

test('B112 body path cannot override digest, date, host or Authorization', () => {
  for (const field of [
    'host', 'HOST', 'X-AMZ-DATE', 'x-amz-content-sha256',
    'X-Amz-Content-Sha256', 'authorization', 'Authorization',
  ]) {
    assert.throws(() => headers(Buffer.from('private'), { [field]: 'spoofed' }),
      /invalid or reserved header/u, field);
  }
});

test('B112 body signer forbids casing-colliding signed header names', () => {
  assert.throws(() => headers(Buffer.alloc(0), {
    'Content-Type': 'text/plain',
    'content-type': 'application/json',
  }), /invalid or reserved header/u);
});

test('B112 body signer rejects newline, carriage-return and NUL injection', () => {
  for (const value of [
    'application/json\r\nx-amz-date: 20000101T000000Z',
    'application/json\nSignature=forged',
    'application/json\u0000suffix',
  ]) {
    assert.throws(() => headers(Buffer.alloc(0), { 'content-type': value }),
      /invalid or reserved header/u);
  }
});

test('B112 body signer rejects malformed extra header names and values', () => {
  for (const name of ['content type', 'content\ntype', ':method', 'Content_Type']) {
    assert.throws(() => headers(Buffer.alloc(0), { [name]: 'v' }),
      /invalid or reserved header/u);
  }
  assert.throws(() => headers(Buffer.alloc(0), { 'content-type': null }),
    /invalid or reserved header/u);
});

test('B112 multipart body signed metadata is stable across header casing', () => {
  const a = headers(Buffer.from('abc'), { 'Content-Type': 'text/plain' });
  const b = headers(Buffer.from('abc'), { 'content-type': 'text/plain' });
  assert.deepEqual([...a], [...b]);
});

test('B112 rejects malformed body extras before any provider/network work', () => {
  const invalid = { 'x-amz-content-sha256': '0'.repeat(64) };
  assert.throws(() => headers(Buffer.from('actual-payload'), invalid),
    /invalid or reserved header/u);
  assert.equal(headers(Buffer.alloc(0)).get('x-amz-content-sha256'),
    sha(Buffer.alloc(0)));
});
