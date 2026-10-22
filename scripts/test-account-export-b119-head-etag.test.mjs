import assert from 'node:assert/strict';
import test from 'node:test';

import { normalizeS3HeadObjectEtag as parse } from
  '../apps/api/src/files/storage/s3-head-etag.ts';

test('B119 HEAD accepts a missing optional ETag without synthesizing one', () => {
  assert.equal(parse(null), null);
});

test('B119 HEAD preserves balanced standard and S3-compatible opaque ETags', () => {
  for (const [raw, result] of [
    ['"etag-1"', 'etag-1'],
    ['"abcd0123456789-2"', 'abcd0123456789-2'],
    ['unquoted-compatible', 'unquoted-compatible'],
    ['"opaque&token"', 'opaque&token'],
    ['"' + 'z'.repeat(254) + '"', 'z'.repeat(254)],
  ]) assert.equal(parse(raw), result, raw);
});

test('B119 HEAD rejects unbalanced, embedded or missing ETag tokens', () => {
  for (const raw of ['', '"', '""', '"abc', 'abc"', '"ab"cd"',
    'ab"cd', 'abc\\def', '""quoted""']) {
    assert.throws(() => parse(raw), /S3 HEAD returned an invalid ETag/u, raw);
  }
});

test('B119 HEAD rejects unsafe whitespace, control bytes and non-ASCII headers', () => {
  for (const raw of ['white space', '"white space"', 'ab\tcd', 'ab\r',
    'ab\n', 'abc\u0000', 'abc\u007f', 'abc\u00a0', 'áb']) {
    assert.throws(() => parse(raw), /S3 HEAD returned an invalid ETag/u);
  }
});

test('B119 HEAD bounds ETags before retaining metadata', () => {
  for (const raw of ['z'.repeat(255), '"' + 'z'.repeat(255) + '"',
    'z'.repeat(257)]) {
    assert.throws(() => parse(raw), /S3 HEAD returned an invalid ETag/u);
  }
  assert.equal(parse('z'.repeat(254)), 'z'.repeat(254));
});
