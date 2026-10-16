import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';

import { verifyAccountExportStoredBytes } from '../apps/api/src/data-lifecycle/domain/account-export-artifact-readback.ts';
import { verifyAccountExportDownload } from '../apps/api/src/data-lifecycle/storage/account-export-download-integrity.ts';

const bytes = Buffer.from('{"account":"private","export":"portable"}');
const expected = {
  byteLength: bytes.length,
  sha256: createHash('sha256').update(bytes).digest('hex'),
};
const stream = async function* (...chunks) {
  for (const chunk of chunks) yield chunk;
};

async function twoPassDownload(get, onBegin) {
  // Simulates the B91 preflight-then-stream boundary, using the two real
  // production streaming validators. The controller wiring is separately
  // asserted in the source-contract guard.
  await verifyAccountExportStoredBytes(get(), expected);
  onBegin();
  const out = [];
  for await (const chunk of verifyAccountExportDownload(
    get(), expected.byteLength, expected.sha256,
  )) out.push(Buffer.from(chunk));
  return Buffer.concat(out);
}

test('B91 healthy artifact is verified before any simulated response starts', async () => {
  const events = [];
  let reads = 0;
  const result = await twoPassDownload(() => {
    reads++;
    events.push('GET');
    return stream(bytes.subarray(0, 9), bytes.subarray(9));
  }, () => events.push('HTTP begin'));
  assert.deepEqual(result, bytes);
  assert.deepEqual(events, ['GET', 'HTTP begin', 'GET']);
  assert.equal(reads, 2);
});

test('B91 same-size corrupted artifact never begins a response', async () => {
  const bad = Buffer.from(bytes);
  bad[12] ^= 0x01;
  let started = 0;
  let reads = 0;
  await assert.rejects(twoPassDownload(() => {
    reads++;
    return stream(bad);
  }, () => started++), /SHA-256 mismatch/u);
  assert.equal(started, 0);
  assert.equal(reads, 1);
});

test('B91 truncated artifact never begins streaming', async () => {
  let started = 0;
  await assert.rejects(twoPassDownload(
    () => stream(bytes.subarray(0, bytes.length - 3)),
    () => started++,
  ), /byte length mismatch/u);
  assert.equal(started, 0);
});

test('B91 GET provider exception never begins streaming', async () => {
  let started = false;
  const fail = async function* () {
    yield bytes.subarray(0, 5);
    throw new Error('provider GET 503');
  };
  await assert.rejects(twoPassDownload(() => fail(),
    () => { started = true; }), /provider GET 503/u);
  assert.equal(started, false);
});

test('B91 overlong GET preflight stops before reading remaining chunks', async () => {
  let started = false;
  let readCount = 0;
  const get = async function* () {
    readCount++;
    yield Buffer.alloc(bytes.length + 1);
    readCount++;
    yield bytes;
  };
  await assert.rejects(twoPassDownload(() => get(),
    () => { started = true; }), /exceeds expected byte length/u);
  assert.equal(started, false);
  assert.equal(readCount, 1);
});

test('B91 changed object after good preflight is still rejected by download stream', async () => {
  const bad = Buffer.from(bytes);
  bad[10] ^= 0x01;
  let reads = 0;
  let responseStarted = false;
  await assert.rejects(twoPassDownload(() => {
    reads++;
    return stream(reads === 1 ? bytes : bad);
  }, () => { responseStarted = true; }), /integrity check failed/u);
  assert.equal(reads, 2);
  assert.equal(responseStarted, true);
});

test('B91 preflight also rejects invalid stored metadata before reading', async () => {
  let iteratorStarted = false;
  const get = async function* () { iteratorStarted = true; yield bytes; };
  await assert.rejects(verifyAccountExportStoredBytes(get(),
    { byteLength: 0, sha256: expected.sha256 }),
  /expected metadata is invalid/u);
  assert.equal(iteratorStarted, false);
});
