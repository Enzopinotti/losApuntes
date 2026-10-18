import assert from 'node:assert/strict';
import test from 'node:test';
import {
  parseS3FullObjectContentLength as parse,
  assertS3FullObjectContentLength as verify,
} from '../apps/api/src/files/storage/s3-full-object-length.ts';

test('B115 accepts safe integer Content-Length including zero', () => {
  assert.equal(parse('0'), 0);
  assert.equal(parse('8'), 8);
  assert.equal(parse('9007199254740991'), Number.MAX_SAFE_INTEGER);
  assert.equal(parse(null), null);
});

test('B115 rejects malformed, noncanonical and unsafe Content-Length', () => {
  for (const raw of [
    '', '-1', '+2', '01', ' 8', '8 ', '8.0', '8, 8', 'NaN',
    '8\r\nx-hack: yes', '9007199254740992', 'Infinity',
  ]) assert.throws(() => parse(raw), /invalid Content-Length/u, raw);
});

test('B115 accepts exactly the declared body size at normal EOF', () => {
  verify(8, 4, false);
  verify(8, 8, false);
  assert.doesNotThrow(() => verify(8, 8, true));
  assert.doesNotThrow(() => verify(0, 0, true));
});

test('B115 fails closed on natural EOF with fewer bytes than declared', () => {
  assert.throws(() => verify(8, 3, true), /truncated Content-Length body/u);
  assert.throws(() => verify(1, 0, true), /truncated Content-Length body/u);
});

test('B115 rejects extra bytes before exposing them to the consumer', () => {
  assert.throws(() => verify(8, 9, false), /exceeded declared Content-Length/u);
  assert.throws(() => verify(0, 1, false), /exceeded declared Content-Length/u);
});

test('B115 missing Content-Length retains chunked provider compatibility', () => {
  verify(null, 500, false);
  verify(null, 500, true);
  verify(null, 0, true);
});

test('B115 stopping early is not confused with provider EOF', () => {
  verify(8, 4, false);
  assert.throws(() => verify(8, 4, true), /truncated Content-Length body/u);
});

test('B115 impossible counters cannot silently wrap to valid lengths', () => {
  for (const count of [NaN, Infinity, -1, 0.2, Number.MAX_SAFE_INTEGER + 1]) {
    assert.throws(() => verify(null, count, false),
      /exceeded declared Content-Length/u);
  }
});
