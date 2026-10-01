# Files safety & quarantine v1

**Carrier:** #78  
**Scope:** repository-owned malware/quarantine foundation for Files/Resources  
**Non-goal:** claiming production scanner deployment evidence from CI

## Authority boundary

A valid MIME type, byte signature, exact Content-Length and successful object-storage upload do not prove that a document is safe to share. File safety is therefore a separate backend authority from Resource visibility.

A FileAsset is shareable only when all of these are true:

1. object size/content type/signature verification succeeded;
2. the safety scanner returned `clean`;
3. that result was committed by the current scan claim;
4. durable `scanCompletedAt + scanEngine` evidence exists;
5. state is `ready`.

Resource authorization and visibility are evaluated later and cannot override quarantine.

## State machine

```text
pending
  -> scan_pending
  -> scanning
      -> ready
      -> rejected
      -> scan_pending  (bounded retry)
      -> failed        (retry exhausted / invalid metadata)

expired unclaimed states
  -> reclaiming
  -> reclaimed
```

Legacy `ready` assets without scan evidence are intentionally treated as untrusted. They are eligible for a fresh scan, and Resource/File delivery remains unavailable until clean evidence exists.

## Scan ownership

Scanning uses a random claim id plus a bounded lease.

Only the worker holding the current `scanClaimId` may commit clean/rejected/retry results. If a worker stalls and its lease expires, another worker can claim the asset; the stale worker's later completion no longer matches and cannot publish authority.

This claim fencing is necessary even when there is only one worker in the current deployment because crash/restart and future horizontal scaling must not create stale commits.

## Streaming

The object-storage adapter exposes an async chunk stream. The Files service never needs to load a 50 MiB file into memory to scan it.

The S3-compatible implementation:

- performs a server-authorized GET against the private storage endpoint;
- yields bounded chunks;
- never returns storage credentials to clients;
- does not log signed URLs, object keys, filenames or raw bytes.

## Scanner adapters

### Deterministic local/CI adapter

Local/CI uses an inert marker:

`LOSAPUNTES-QUARANTINE-TEST-MARKER-V1`

It exists only to prove state transitions, streaming, rejection, cleanup and Resource fail-closed behavior. It is not malware detection and is forbidden for non-local production runtime.

### ClamAV adapter

The repository includes a provider-neutral ClamAV INSTREAM adapter:

- TCP connection is bounded by timeout;
- request frames are bounded;
- response bytes are bounded;
- full-file byte count must equal verified FileAsset byte size;
- `OK` maps to clean;
- `FOUND` maps to malicious;
- unknown/timeout/network failures fail closed.

Production must configure a real scanner and prove runtime connectivity/capacity separately. Scanner-side stream limits must be at least the application's current 50 MiB file policy or uploads can never complete scanning reliably.

## Retry and cleanup

Scanner failure never changes an asset to ready.

Retries use bounded exponential delay and a maximum attempt budget. Exhaustion transitions to failed and leaves cleanup durable. A malicious verdict transitions to rejected before best-effort byte deletion, so deletion failure cannot accidentally restore shareability.

The cleanup worker may reclaim expired scan states, but cannot steal an active scan lease.

## Client contract

Clients do not decide whether a file is safe.

A successful finalize still returns a normal ready FileAsset when synchronous scanning completes cleanly. During scanner degradation the API may return a typed scan-pending/unavailable response while retaining the same durable FileAsset. Clients must retry the same finalize/status flow rather than minting duplicate upload identity.

A rejected FileAsset cannot be claimed by a Resource or receive a signed download.

## Evidence

Permanent repository evidence covers:

- clean scan -> ready;
- rejection -> non-shareable;
- scanner outage -> durable retry;
- retry exhaustion -> failed closed;
- scan claim/lease ownership;
- legacy ready row -> rescan;
- streaming object read;
- rejected Resource claim denied;
- rejected byte cleanup;
- exact-head container smoke with RustFS.

External production evidence still includes actual scanner deployment, monitoring, resource budgets and operational failure drills.
