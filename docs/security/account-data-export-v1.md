# Account data export v1 — foundation contract

**Parent:** #82  
**Implementation issue:** #183  
**Functional requirement:** AUTH-FR-012

## Boundary of this carrier

This carrier establishes the durable and bounded foundation for self-service
account data export. It deliberately does **not** expose a public request,
status or download endpoint yet.

An export surface is user-complete only when the repository can assemble every
section included by the functional contract into a real artifact and
reauthorize delivery. Returning `202 Accepted` for a job that has no complete
assembler would create false product behavior, so HTTP exposure is deferred to
the carrier that adds the first complete artifact path.

This is infrastructure for export, not deletion, anonymization or retention.

## Durable job model

`account_export_jobs` records one active export job per user.

The foundation states are:

- `pending` — available for an assembler to claim;
- `processing` — owned by one lease-bound worker claim;
- `failed` — terminal for that job and no longer occupies the active slot.

A partial unique index on `userId + active=true` prevents two concurrent
requests from creating two active exports. A request that loses the concurrent
upsert replays the winning active job instead.

Failed history is retained. Because a failed job becomes inactive, a later
request can create a new active job without rewriting the earlier failure as if
it never happened.

The job records:

- stable export job id;
- owner user id;
- state and active slot;
- export format version;
- bounded attempt count state;
- next-attempt time;
- claim id and lease expiry;
- bounded failure code;
- terminal failure timestamp;
- created/updated timestamps.

Claim ids and lease timestamps are worker coordination metadata. They are not
part of the future public status projection.

## Claim and retry semantics

Claiming is a compare-and-swap operation over either:

1. a due `pending` job; or
2. a `processing` job whose lease expired.

A claim:

- moves state to `processing`;
- writes a fresh claim id and lease expiry;
- increments attempts;
- clears the previous failure marker.

Only the holder of the current claim id may reschedule that processing job.
Retry returns it to `pending`; terminal exhaustion moves it to `failed`,
sets `active=false`, and records a stable failure code.

The foundation does not yet choose retry timings for assembly because no
assembler runs in this carrier. The future processor owns that policy and must
keep it bounded.

## Export format contract

The product format identifier is:

`los-apuntes-account-export`

The initial format version is `1`.

Changing the meaning of an existing field without compatibility is not allowed.
A materially incompatible export shape requires a new format version.

The final artifact should be streamable rather than constructed as one giant
in-memory JSON object. The precise container/framing belongs to the assembler
carrier; this foundation does not pretend that an artifact already exists.

## Domain contributor contract

Data Lifecycle orchestrates export. It must not reach directly into every
domain's Mongo collections and thereby become a second source of truth.

Each included domain contributes through an explicit
`AccountExportContributor` projection.

A contributor receives:

- the owner user id;
- an opaque cursor or `null`;
- a caller-owned page limit.

It returns:

- portable JSON records for exactly one named section;
- an opaque next cursor or `null`.

The orchestrator always calls contributors with a maximum page size of 100 and
rejects a contributor that returns more records than the budget.

A contributor must preserve its own domain authority and ordering. Export is a
read projection: it does not mutate ownership or grant access.

## Security and privacy exclusions

Export output must never contain:

- password or password hash;
- raw AuthSession credential;
- cookie;
- raw verification/recovery/action token or token hash;
- Google/provider access, refresh or identity proof token;
- secret configuration;
- private object-storage object key;
- signed upload/download URL;
- arbitrary application logs.

Identifiers needed to explain the user's own history may be included only when
the section contract explicitly defines them.

Worker logs may contain bounded job/section/correlation metadata but never
export record bodies.

## Shared data

Exporting the user's history does not transfer ownership and does not make a
shared object private to the requester.

Examples:

- a Resource authored by the user can appear in the user's export while the
  canonical shared Resource remains in place;
- a save/share/follow is exported as the user's relationship, not as authority
  over the target;
- Organization management/history, Q&A attribution and Academic/Alumni history
  remain governed by their own domain contracts.

## Explicit non-goals

This foundation does not decide:

- hard-delete or anonymization;
- legal retention horizons;
- backup deletion promises;
- Organization purge;
- destructive provider reauthentication;
- export artifact storage provider or public delivery route;
- production legal wording.

Those remain #82/#48 or later #183 slices.

## Merge acceptance for this foundation

Before this foundation can merge:

- job creation/replay is concurrency-safe;
- owner-scoped lookup exists at the store/service boundary;
- claim/lease recovery is deterministic;
- retry vs terminal failure preserves history;
- terminal failures release the active slot;
- contributor page limits are executable in code and tests;
- module wiring is real;
- no public export endpoint or fake `ready` state is advertised;
- exact-head quality/coverage/runtime evidence is recorded under the normal
  repository gate, with #141 treated only as the separately tracked advisory.
