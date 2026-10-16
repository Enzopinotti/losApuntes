import assert from 'node:assert/strict';
import test from 'node:test';

import { enqueueAccountExportOrphanWithRetry } from '../apps/api/src/data-lifecycle/domain/account-export-orphan-enqueue.ts';

const counters = () => ({
  orphanEnqueueRetries: 0,
  orphanEnqueueRecovered: 0,
  orphanEnqueueFailures: 0,
});

test('B79: immediate durable enqueue has no retry or failure counters', async () => {
  const metrics = counters();
  const delays = [];
  let calls = 0;
  const ok = await enqueueAccountExportOrphanWithRetry(
    async () => { calls += 1; },
    metrics,
    async (milliseconds) => { delays.push(milliseconds); },
  );
  assert.equal(ok, true);
  assert.equal(calls, 1);
  assert.deepEqual(delays, []);
  assert.deepEqual(metrics, counters());
});

test('B79: transient Mongo error recovers on the second attempt', async () => {
  const metrics = counters();
  const delays = [];
  let calls = 0;
  const ok = await enqueueAccountExportOrphanWithRetry(
    async () => {
      calls += 1;
      if (calls === 1) throw new Error('private Mongo connection detail');
    },
    metrics,
    async (milliseconds) => { delays.push(milliseconds); },
  );
  assert.equal(ok, true);
  assert.equal(calls, 2);
  assert.deepEqual(delays, [50]);
  assert.deepEqual(metrics, {
    orphanEnqueueRetries: 1, orphanEnqueueRecovered: 1, orphanEnqueueFailures: 0,
  });
});

test('B79: two failed writes recover on the third attempt, with bounded delays', async () => {
  const metrics = counters();
  const delays = [];
  let calls = 0;
  const ok = await enqueueAccountExportOrphanWithRetry(
    async () => {
      calls += 1;
      if (calls < 3) throw new Error('Mongo unavailable');
    },
    metrics,
    async (milliseconds) => { delays.push(milliseconds); },
  );
  assert.equal(ok, true);
  assert.equal(calls, 3);
  assert.deepEqual(delays, [50, 100]);
  assert.deepEqual(metrics, {
    orphanEnqueueRetries: 2, orphanEnqueueRecovered: 1, orphanEnqueueFailures: 0,
  });
});

test('B79: permanent Mongo outage fails closed after exactly three attempts', async () => {
  const metrics = counters();
  const delays = [];
  let calls = 0;
  const ok = await enqueueAccountExportOrphanWithRetry(
    async () => { calls += 1; throw new Error('secret storage detail'); },
    metrics,
    async (milliseconds) => { delays.push(milliseconds); },
  );
  assert.equal(ok, false);
  assert.equal(calls, 3);
  assert.deepEqual(delays, [50, 100]);
  assert.deepEqual(metrics, {
    orphanEnqueueRetries: 2, orphanEnqueueRecovered: 0, orphanEnqueueFailures: 1,
  });
});

test('B79: counters remain isolated between iterations', async () => {
  const first = counters();
  const second = counters();
  await enqueueAccountExportOrphanWithRetry(
    async () => { throw new Error('down'); }, first, async () => {},
  );
  await enqueueAccountExportOrphanWithRetry(
    async () => {}, second, async () => {},
  );
  assert.equal(first.orphanEnqueueFailures, 1);
  assert.deepEqual(second, counters());
});
