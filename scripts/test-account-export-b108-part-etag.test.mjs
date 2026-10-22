import assert from 'node:assert/strict';
import test from 'node:test';
import { normalizeS3MultipartPartEtag as parse } from
  '../apps/api/src/files/storage/s3-multipart-part-etag.ts';

test('B108 accepts standard quoted and compatible unquoted part ETags', () => {
  for (const [input, value] of [
    ['"0123456789abcdef"', '0123456789abcdef'],
    ['unquoted-s3-compatible', 'unquoted-s3-compatible'],
    [' "my-version+_=-1" ', 'my-version+_=-1'],
    ['opaque&value', 'opaque&value'],
    ['"' + 'a'.repeat(254) + '"', 'a'.repeat(254)],
  ]) assert.equal(parse(input), value, input);
});

test('B108 malformed or unmatched quotes cannot become a completion part', () => {
  for (const input of [
    null, '', '"', '""', ' " " ', '"part-one', 'part-one"',
    '"part"two"', 'part"two', 'part\\two', '"part\\two"',
  ]) assert.equal(parse(input), null, String(input));
});

test('B108 rejects invalid HTTP whitespace and control characters', () => {
  for (const input of [
    '"part with space"', 'part with space',
    '"part\twith-tab"', 'part\twith-tab', '"part\r"',
    '"part\n"', '\u0000part', 'part\u007f',
    'part\u00a0suffix', 'part☃',
  ]) assert.equal(parse(input), null, input);
});

test('B108 rejects oversized ETags, including quoted/unquoted huge values', () => {
  for (const input of [
    'x'.repeat(255), 'x'.repeat(257),
    '"' + 'x'.repeat(255) + '"', ' ' + 'x'.repeat(254) + '  ',
  ]) assert.equal(parse(input), null, input.slice(0, 20));
  assert.equal(parse('x'.repeat(254)), 'x'.repeat(254));
});

test('B108 preserves the exact opaque token for XML escaping by the writer', () => {
  for (const raw of ['"a&b"', '<unsafe>', '&amp;', '+/=-_.:']) {
    const token = parse(raw);
    assert.ok(token);
    assert.equal(token, raw.startsWith('"') ? raw.slice(1, -1) : raw);
  }
});
