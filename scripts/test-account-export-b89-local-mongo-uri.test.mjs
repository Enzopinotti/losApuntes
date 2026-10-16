import assert from 'node:assert/strict';
import test from 'node:test';
import { validateB89LocalMongoUri } from './testing/b89-local-mongo-uri.mjs';

const URI = 'mongodb://127.0.0.1:27017/?replicaSet=rs0';
const loopback = async () => [{ address: '127.0.0.1', family: 4 }];
const resolveAllLoopback = async () => [
  { address: '127.0.0.1', family: 4 },
  { address: '::1', family: 6 },
];
const ensureRejected = async (uri, resolver = loopback) =>
  assert.rejects(validateB89LocalMongoUri(uri, { lookupHost: resolver }),
    /requires an uncredentialed loopback/u);

test('B89 uses the real system resolver for a numeric 127.0.0.1 URI', async () => {
  assert.equal(await validateB89LocalMongoUri(URI), URI + '&directConnection=true');
});

test('B89 accepts only explicit uncredentialed localhost with all loopback addresses', async () => {
  const localhostUri = 'mongodb://localhost:27017/?replicaSet=rs0';
  assert.equal(await validateB89LocalMongoUri(localhostUri, {
    lookupHost: resolveAllLoopback,
  }), URI + '&directConnection=true');
});

test('B89 accepts a bracketed IPv6 loopback replica endpoint', async () => {
  const ipv6 = 'mongodb://[::1]:27017/?replicaSet=rs_local-1';
  assert.equal(await validateB89LocalMongoUri(ipv6, {
    lookupHost: async () => [{ address: '::1', family: 6 }],
  }), ipv6 + '&directConnection=true');
});

test('B89 pins localhost to a validated numeric destination before the driver runs', async () => {
  const requested = 'mongodb://localhost:27017/?replicaSet=rs0';
  const pinned = await validateB89LocalMongoUri(requested, {
    lookupHost: async () => [
      { address: '::1', family: 6 },
      { address: '127.0.0.1', family: 4 },
    ],
  });
  assert.equal(pinned, URI + '&directConnection=true');
  assert.equal(new URL(pinned).hostname, '127.0.0.1');
  assert.equal(new URL(pinned).searchParams.get('directConnection'), 'true');
});

test('B89 direct-mode also pins a localhost host resolving only to IPv6 loopback', async () => {
  const pinned = await validateB89LocalMongoUri(
    'mongodb://localhost:27017/?replicaSet=rs0', {
      lookupHost: async () => [{ address: '::1', family: 6 }],
    },
  );
  assert.equal(pinned,
    'mongodb://[::1]:27017/?replicaSet=rs0&directConnection=true');
});

test('B89 rejects a plausible docker alias that could resolve remotely', async () => {
  await ensureRejected('mongodb://mongo:27017/?replicaSet=rs0');
  await ensureRejected('mongodb://database:27017/?replicaSet=rs0');
});

test('B89 rejects explicit foreign and nonloopback IPs, including IPv4-mapped IPv6', async () => {
  for (const host of ['192.168.1.10', '8.8.8.8', '[::ffff:127.0.0.1]', '[2001:db8::1]']) {
    await ensureRejected(`mongodb://${host}:27017/?replicaSet=rs0`);
  }
});

test('B89 rejects a localhost alias with mixed loopback and external DNS answers', async () => {
  await ensureRejected('mongodb://localhost:27017/?replicaSet=rs0', async () => [
    { address: '127.0.0.1', family: 4 },
    { address: '10.1.2.3', family: 4 },
  ]);
});

test('B89 fails closed for DNS errors, empty lookup results and family spoofing', async () => {
  await ensureRejected(URI, async () => { throw new Error('resolver unavailable'); });
  await ensureRejected(URI, async () => []);
  await ensureRejected(URI, async () => [{ address: '8.8.8.8', family: 4 }]);
  await ensureRejected(URI, async () => [{ address: '127.0.0.1', family: 6 }]);
  await ensureRejected(URI, async () => [{ address: '127.0.0.1', family: 0 }]);
});

test('B89 rejects Mongo connection strings with embedded authentication', async () => {
  for (const uri of [
    'mongodb://admin:secret@127.0.0.1:27017/?replicaSet=rs0',
    'mongodb://user@localhost:27017/?replicaSet=rs0',
    'mongodb://localhost:27017/?replicaSet=rs0#credentials',
  ]) await ensureRejected(uri);
});

test('B89 refuses database selection or extra connection options', async () => {
  for (const uri of [
    'mongodb://127.0.0.1:27017/test?replicaSet=rs0',
    URI + '&authSource=admin',
    URI + '&tls=true',
    URI + '&directConnection=false',
    URI + '&replicaSet=evil',
    URI + '&readPreference=secondary',
  ]) await ensureRejected(uri);
});

test('B89 requires a single clean replicaSet and explicit valid TCP port', async () => {
  for (const uri of [
    'mongodb://127.0.0.1:27017/',
    'mongodb://127.0.0.1:27017/?replicaSet=',
    'mongodb://127.0.0.1:27017/?replicaSet=a%20b',
    'mongodb://127.0.0.1:27017/?replicaSet=rs0%2Fadmin',
    'mongodb://127.0.0.1/?replicaSet=rs0',
    'mongodb://127.0.0.1:0/?replicaSet=rs0',
    'mongodb://127.0.0.1:65536/?replicaSet=rs0',
    'mongodb://127.0.0.1:abc/?replicaSet=rs0',
  ]) await ensureRejected(uri);
});

test('B89 refuses SRV, HTTP, leading spaces, non-string or malformed URI', async () => {
  for (const value of [
    'mongodb+srv://localhost:27017/?replicaSet=rs0',
    'http://127.0.0.1:27017/?replicaSet=rs0',
    ' ' + URI,
    URI + ' ',
    {},
    undefined,
    '',
    'mongodb://127.0.0.1:27017,evil:27017/?replicaSet=rs0',
  ]) await ensureRejected(value);
});

test('B89 validation does not contact Mongo or require a live replica', async () => {
  let lookups = 0;
  const value = await validateB89LocalMongoUri(URI, {
    lookupHost: async (hostname, args) => {
      lookups += 1;
      assert.equal(hostname, '127.0.0.1');
      assert.equal(args.all, true);
      return [{ address: '127.0.0.1', family: 4 }];
    },
  });
  assert.equal(value, URI + '&directConnection=true');
  assert.equal(lookups, 1);
});
