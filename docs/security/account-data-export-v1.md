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

### Implemented core sections

The first concrete contributors are:

- `account` — one allowlisted account identity/lifecycle record;
- `profile` — one owner profile snapshot, including private visibility,
  presentation and recommendation controls because this is the owner's export;
- `profile.activities` — cursor-paginated owner activity history.

`account` and `profile` are singleton sections. A non-null cursor for either
section is invalid rather than silently ignored.

`profile.activities` reuses Profile's existing deterministic cursor ordering
and domain limit. The export orchestrator may request up to 100 records, while
Profile currently clamps the persistence read to its own maximum of 50.

The core contributor registry sorts section ids deterministically and rejects
blank, padded/noncanonical, or duplicate ids during dependency wiring. This
prevents two domains from silently claiming the same export section or exposing
an id that differs from its registry key.

The `account` projection is allowlisted at query time. The Mongo read selects
only the fields needed by the portable account record; password hashes,
credential/lifecycle authority revisions and platform permissions are not read
and therefore cannot leak through later serialization.

### Implemented Academic sections

Academic now contributes four user-state sections:

- `academic.affiliations` — the user's affiliation relationships and lifecycle
  state;
- `academic.subjectParticipations` — the user's subject/course-offering
  relationship history;
- `academic.currentContext` — the effective current Academic context after a
  read-only Academic-domain validation of stale references;
- `academic.follows` — the user's institution/program follow relationships.

Affiliations, subject participations and follows use dedicated export reads
ordered by immutable `id ASC`. Their opaque cursor contains only the last
emitted id, and persistence reads `limit + 1` to determine continuation.
These reads do not change or reuse the existing UI/lifecycle ordering by
`updatedAt`.

The three paginated export reads have matching `{ userId: 1, id: 1 }` indexes.
`academic.currentContext` is cursorless and may be empty. Its export projection never repairs persistence:
invalid subject references are omitted in memory, invalid/withdrawn affiliation
contexts produce an empty section, and export does not call context mutation or
append Academic audit events.

Academic export contains relationship references and user-owned lifecycle state,
not the global Academic catalog. It does not export catalog source provenance,
admin audit events, internal context guard revisions, or catalog proposals in
this carrier.


## Security and privacy exclusions

Export output must never contain:

- password or password hash;
- credential/account-lifecycle/management authority revision counters;
- internal platform permission grants;
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

Resources/Files, Social/Q&A, Organizations, Notifications and Alumni are still
unimplemented export domains. User-authored Academic catalog proposals are also
outside the currently implemented v1 Academic carrier pending a separate
inclusion decision. The presence of the core and Academic sections does not make
the overall export product complete or ready for public HTTP delivery.

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
