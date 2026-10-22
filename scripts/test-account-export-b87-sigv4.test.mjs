import assert from 'node:assert/strict';
import { createHash, createHmac } from 'node:crypto';
import test from 'node:test';

import { verifyB87S3SigV4 } from './testing/b87-s3-sigv4-verifier.mjs';

const NOW = new Date('2026-10-16T14:00:00.000Z');
const key = 'exports/11111111-1111-4111-8111-111111111111/22222222-2222-4222-8222-222222222222.json';
const bucket = 'b86-private-acceptance';
const path = `/${bucket}/${key}`;
const options = {
  bucket, objectKey: key, region: 'us-east-1',
  accessKeyId: 'b86-local-fixture',
  secretAccessKey: 'fixture-only-not-live',
  now: NOW,
};
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const hmac = (key, bytes) => createHmac('sha256', key).update(bytes).digest();
function sign({
  method = 'PUT',
  body = Buffer.from('{"B87":true}'),
  query = '',
  signedExtra = {},
} = {}) {
  const url = new URL('http://127.0.0.1:19086' + path + query);
  const date = '20261016T140000Z';
  const headers = {
    host: url.host,
    'x-amz-content-sha256': sha(body),
    'x-amz-date': date,
    ...signedExtra,
  };
  const signed = Object.keys(headers).sort().join(';');
  const entries = [...url.searchParams.entries()].sort(([ak, av], [bk, bv]) =>
    ak < bk ? -1 : ak > bk ? 1 : av < bv ? -1 : av > bv ? 1 : 0,
  );
  const canonicalQuery = entries.map(([k, v]) => `${k}=${v}`).join('&');
  const canonicalHeaders = Object.entries(headers)
    .sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0)
    .map(([k, v]) => `${k}:${v}\n`).join('');
  const canonical = [
    method, path, canonicalQuery, canonicalHeaders, signed, sha(body),
  ].join('\n');
  const scope = '20261016/us-east-1/s3/aws4_request';
  const toSign = ['AWS4-HMAC-SHA256', date, scope, sha(canonical)].join('\n');
  let derived = Buffer.from('AWS4' + options.secretAccessKey);
  for (const part of ['20261016', 'us-east-1', 's3', 'aws4_request']) {
    derived = hmac(derived, part);
  }
  headers.authorization =
    `AWS4-HMAC-SHA256 Credential=${options.accessKeyId}/${scope}, ` +
    `SignedHeaders=${signed}, Signature=${createHmac('sha256', derived).update(toSign).digest('hex')}`;
  return { method, url, headers, body, ...options };
}

test('B87 independent SigV4 verifier accepts valid exact-object signed PUT', () => {
  const request = sign();
  assert.equal(verifyB87S3SigV4(request), true);
});

test('B87 accepts AWS canonical query on multipart upload and signed content-type', () => {
  const request = sign({
    query: '?uploadId=private-u1&partNumber=2',
    signedExtra: { 'content-type': 'application/octet-stream' },
  });
  assert.equal(verifyB87S3SigV4(request), true);
  assert.equal(verifyB87S3SigV4(sign({ method: 'POST', query: '?uploads=' })), true);
});

test('B87 accepts empty-body signed GET with exact host and object', () => {
  assert.equal(verifyB87S3SigV4(sign({ method: 'GET', body: Buffer.alloc(0) })), true);
});

test('B87 rejects a plausible AWS4 prefix with forged signature', () => {
  const request = sign();
  request.headers.authorization = request.headers.authorization
    .replace(/Signature=[0-9a-f]{64}/u, 'Signature=' + '0'.repeat(64));
  assert.equal(verifyB87S3SigV4(request), false);
});

test('B87 denies changing any signed payload byte without recomputing SigV4', () => {
  const request = sign();
  request.body = Buffer.from('{"B87":false}');
  assert.equal(verifyB87S3SigV4(request), false);
});

test('B87 denies modification of the signed object path or query', () => {
  const request = sign({ query: '?uploads=' });
  assert.equal(verifyB87S3SigV4({
    ...request, url: new URL(String(request.url).replace(
      '/exports/', '/exports/foreign-owner/',
    )),
  }), false);
  assert.equal(verifyB87S3SigV4({
    ...request, url: new URL(String(request.url) + '&unexpected=1'),
  }), false);
});

test('B87 denies wrong region, credential, secret and request clock', () => {
  const request = sign();
  assert.equal(verifyB87S3SigV4({ ...request, region: 'eu-west-1' }), false);
  assert.equal(verifyB87S3SigV4({ ...request, accessKeyId: 'another-key' }), false);
  assert.equal(verifyB87S3SigV4({ ...request, secretAccessKey: 'bad-secret' }), false);
  assert.equal(verifyB87S3SigV4({
    ...request, now: new Date(NOW.getTime() + 16 * 60_000),
  }), false);
});

test('B87 denies missing, duplicate or altered authorization-scope headers', () => {
  const request = sign();
  const { authorization, ...rest } = request.headers;
  assert.equal(verifyB87S3SigV4({ ...request, headers: rest }), false);
  assert.equal(verifyB87S3SigV4({
    ...request, headers: { ...request.headers, Host: request.headers.host },
  }), false);
  assert.equal(verifyB87S3SigV4({
    ...request, headers: { ...request.headers, host: '127.0.0.1:9999' },
  }), false);
  assert.equal(verifyB87S3SigV4({
    ...request, headers: { ...request.headers, 'x-amz-date': '20261016T141000Z' },
  }), false);
});

test('B87 rejects malformed dates and non-binary body without exceptions', () => {
  const request = sign();
  assert.equal(verifyB87S3SigV4({
    ...request, headers: { ...request.headers, 'x-amz-date': 'invalid' },
  }), false);
  assert.equal(verifyB87S3SigV4({ ...request, body: 'not-bytes' }), false);
  assert.equal(verifyB87S3SigV4({ ...request, now: new Date('invalid') }), false);
});
