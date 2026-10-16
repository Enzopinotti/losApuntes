import { lookup as systemLookup } from 'node:dns/promises';
import { isIP } from 'node:net';

/**
 * B89: validation for the destructive, isolated Mongo acceptance runner.
 *
 * Hostname allowlisting alone is insufficient: an apparently local alias
 * can resolve to a remote replica. Never spawn Jest or create a database
 * until this resolver has confirmed EVERY endpoint is real loopback.
 *
 * The resolver argument is injectable only for deterministic test vectors.
 * Production uses node:dns/promises.lookup without external services.
 */
export async function validateB89LocalMongoUri(raw, {
  lookupHost = systemLookup,
} = {}) {
  const fail = () => {
    throw new Error('B89 requires an uncredentialed loopback Mongo replica-set URI');
  };

  if (typeof raw !== 'string' || raw !== raw.trim() || !raw) fail();

  let parsed;
  try {
    parsed = new URL(raw);
  } catch {
    fail();
  }

  const hostname = parsed.hostname.replace(/^\[|\]$/gu, '');
  if (
    parsed.protocol !== 'mongodb:' ||
    !['127.0.0.1', 'localhost', '::1'].includes(hostname) ||
    parsed.username || parsed.password || parsed.hash ||
    (parsed.pathname !== '/' && parsed.pathname !== '') ||
    !/^\d{1,5}$/u.test(parsed.port)
  ) fail();

  const port = Number(parsed.port);
  if (!Number.isSafeInteger(port) || port < 1 || port > 65535) fail();

  // No options capable of rerouting or changing authentication/TLS
  // behavior. The test suite owns its isolated dbName and topology checks.
  const entries = [...parsed.searchParams.entries()];
  if (entries.length !== 1 || entries[0][0] !== 'replicaSet' ||
    !/^[A-Za-z0-9_.-]{1,64}$/u.test(entries[0][1])) fail();

  let addresses;
  try {
    addresses = await lookupHost(hostname, { all: true, verbatim: true });
  } catch {
    fail();
  }
  if (!Array.isArray(addresses) || addresses.length === 0) fail();

  for (const entry of addresses) {
    if (!entry || typeof entry.address !== 'string' ||
      !Number.isInteger(entry.family) ||
      entry.family !== isIP(entry.address)) fail();

    const loopbackIpv4 = entry.family === 4 &&
      entry.address.split('.')[0] === '127';
    const loopbackIpv6 = entry.family === 6 && entry.address === '::1';
    if (!loopbackIpv4 && !loopbackIpv6) fail();
  }

  // Prevent DNS rebinding between preflight and the Mongo driver's
  // own connection. Pin the checked numeric address, then force a direct
  // connection so a replica-set hello cannot redirect the driver to an
  // advertised hostname outside loopback.
  const preferred = addresses.find(entry =>
    entry.family === 4 && entry.address === '127.0.0.1'
  ) ?? addresses.find(entry => entry.family === 4) ?? addresses[0];
  parsed.hostname = preferred.family === 6
    ? `[${preferred.address}]`
    : preferred.address;
  parsed.searchParams.set('directConnection', 'true');
  return parsed.toString();
}
