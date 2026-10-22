import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';

import { collectS3SignedRequestHeaders as collect } from
  '../apps/api/src/files/storage/s3-signed-request-headers.ts';

const base = () => collect('127.0.0.1:9000', '0'.repeat(64), '20261017T120000Z');

test('B110 signs Range on bounded GET using canonical header names and values', () => {
  const map = collect('127.0.0.1:9000', '0'.repeat(64),
    '20261017T120000Z', { Range: '  bytes=0-7   ' });
  assert.equal(map.get('range'), 'bytes=0-7');
  assert.equal([...map.keys()].sort().join(';'),
    'host;range;x-amz-content-sha256;x-amz-date');
  assert.equal([...map.values()].length, 4);
});

test('B110 no-range HEAD or GET retains original signed key inventory', () => {
  assert.deepEqual([...base().keys()].sort(),
    ['host', 'x-amz-content-sha256', 'x-amz-date']);
});

test('B110 signed canonical request digest changes when Range is altered', () => {
  const prefix = collect('127.0.0.1:9000', '0'.repeat(64),
    '20261017T120000Z', { range: 'bytes=0-7' });
  const changed = collect('127.0.0.1:9000', '0'.repeat(64),
    '20261017T120000Z', { range: 'bytes=1-8' });
  const hash = fields => {
    const keys = [...fields.keys()].sort();
    const canonical = [
      'GET', '/bucket/key', '',
      keys.map(k => k + ':' + fields.get(k) + '\n').join(''),
      keys.join(';'), '0'.repeat(64),
    ].join('\n');
    return createHash('sha256').update(canonical).digest('hex');
  };
  assert.notEqual(hash(prefix), hash(changed));
  assert.notEqual(hash(base()), hash(prefix));
});

test('B110 rejects reserved overrides even with mixed-case names', () => {
  for (const key of [
    'host', 'HOST', 'Host', 'authorization', 'Authorization',
    'x-amz-date', 'X-Amz-Date', 'X-Amz-Content-Sha256',
  ]) {
    assert.throws(() => collect('host.test', '0'.repeat(64),
      '20261017T120000Z', { [key]: 'malicious' }), /invalid or reserved/u);
  }
});

test('B110 rejects duplicate extra headers after lowercasing', () => {
  assert.throws(() => collect('host.test', '0'.repeat(64),
    '20261017T120000Z', { Range: 'bytes=0-7', range: 'bytes=1-8' }),
  /invalid or reserved/u);
});

test('B110 rejects header-name injection and newline or NUL value injection', () => {
  for (const extras of [
    { 'range\nhack': 'bytes=0-7' },
    { 'range space': 'bytes=0-7' },
    { range: 'bytes=0-7\r\nX-Attack: 1' },
    { range: 'bytes=0-7\0' },
  ]) {
    assert.throws(() => collect('host.test', '0'.repeat(64),
      '20261017T120000Z', extras), /invalid or reserved/u);
  }
});

test('B110 canonicalizes harmless HTTP whitespace but retains signed metadata', () => {
  const map = collect('host.test', '0'.repeat(64), '20261017T120000Z',
    { RANGE: '\tbytes=0-7  ' });
  assert.equal(map.get('range'), 'bytes=0-7');
  assert.equal(map.get('host'), 'host.test');
  assert.equal(map.get('x-amz-date'), '20261017T120000Z');
});
