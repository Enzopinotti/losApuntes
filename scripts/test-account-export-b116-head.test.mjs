import assert from 'node:assert/strict';
import test from 'node:test';

import {
  isConfirmedS3HeadObject as confirmed,
  parseS3HeadObjectByteSize as parse,
} from '../apps/api/src/files/storage/s3-head-object-contract.ts';

test('B116 HEAD confirms only HTTP 200', () => {
  assert.equal(confirmed(200), true);
  for (const status of [201, 202, 204, 206, 207, 299, 304, 404, 503]) {
    assert.equal(confirmed(status), false, String(status));
  }
});

test('B116 canonical decimal Content-Length admits zero and safe sizes', () => {
  assert.equal(parse('0'), 0);
  assert.equal(parse('8'), 8);
  assert.equal(parse('9007199254740991'), Number.MAX_SAFE_INTEGER);
});

test('B116 missing Content-Length cannot confirm file metadata', () => {
  assert.throws(() => parse(null), /invalid content length/u);
});

test('B116 noncanonical numeric formats are rejected', () => {
  for (const raw of ['', '00', '08', '+8', '-1', ' 8', '8 ', '8.0', '8e2', '0x10']) {
    assert.throws(() => parse(raw), /invalid content length/u, raw);
  }
});

test('B116 duplicate/injected headers fail closed', () => {
  for (const raw of ['8, 8', '8\r\nX-Injected: yes', '8\t', 'NaN', 'Infinity']) {
    assert.throws(() => parse(raw), /invalid content length/u, raw);
  }
});

test('B116 values beyond JS safe integer range are not trusted', () => {
  assert.throws(() => parse('9007199254740992'), /invalid content length/u);
  assert.throws(() => parse('99999999999999999999999999999'), /invalid content length/u);
});
