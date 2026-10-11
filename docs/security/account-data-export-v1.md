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

Before creating/replaying a job or looking up its status, `AccountExportService`
checks that the exact user row still exists and is active through the Users
authority. The same active-account check runs after a claim and before a job is
returned to a processor, and again immediately before the assembler commits a
complete artifact. The query reads only existence, admits
`account_status: "active"` and legacy rows where `account_status` is absent,
and rejects missing, restricted or closed accounts before touching the job
store. If the owner becomes inactive after a job is claimed, that exact claim
is terminally failed with `ACCOUNT_EXPORT_ACCOUNT_INACTIVE` and is not handed
off. Account-state read errors propagate without touching request/status data
or handing a claim to the processor; the finite lease allows that unhanded
claim to be recovered. If the owner becomes inactive or the account-state read
fails during assembly, the assembler aborts private staging, does not commit an
artifact or report completion, and preserves the error for the claim owner to
record. Delivery still requires a separate owner and active-account check at
download time. This service-layer check complements `AuthSessionGuard`; it does
not replace authentication on a future HTTP route.

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

Failure codes are a closed domain allowlist. They are stable identifiers, never
exception messages, user input or export content. The service rejects unknown
codes before persistence and omits unknown legacy values from public status.

The foundation does not yet choose retry timings for assembly because no
assembler runs in this carrier. The future processor owns that policy and must
keep it bounded.

## Export format contract

The product format identifier is:

`los-apuntes-account-export`

The initial format version is `1`.

Changing the meaning of an existing field without compatibility is not allowed.
A materially incompatible export shape requires a new format version.

The artifact is streamed as a versioned JSON envelope rather than constructed
as one giant in-memory object. Durable artifact storage and owner-reauthorized
delivery are separate from this internal assembly contract.

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

### Implemented Auth external identity section

`auth.externalIdentities` contains the current Google identity link for the
exact export owner, if one exists. Its portable record contains `provider`,
the owner's stable `providerSubject`, `emailAtLink` and `linkedAt`.
`providerSubject` identifies the owner's linked Google account; it is not an
OAuth credential or proof and does not authorize login. The email is the value
recorded when linking, not a live provider lookup.

The singleton read filters by `provider: "google"` and the exact `userId`,
uses the existing unique `{ provider: 1, userId: 1 }` index, and selects only
the portable fields. An unlinked owner receives an empty section. Mongo
`_id`, internal `userId`, OAuth attempts/codes/state/nonce/verifier,
provider tokens, sessions, cookies and link/unlink history are excluded. The
projection does not call Google or change the current identity link.

### Implemented Academic sections

Academic now contributes five user-state sections:

- `academic.affiliations` — the user's affiliation relationships and lifecycle
  state;
- `academic.subjectParticipations` — the user's subject/course-offering
  relationship history;
- `academic.currentContext` — the effective current Academic context after a
  read-only Academic-domain validation of stale references;
- `academic.follows` — the user's institution/program follow relationships.
- `academic.proposals` — the user's own submitted Academic catalog proposals.

Affiliations, subject participations and follows use dedicated export reads
ordered by immutable `id ASC`. Their opaque cursor contains only the last
emitted id, and persistence reads `limit + 1` to determine continuation.
These reads do not change or reuse the existing UI/lifecycle ordering by
`updatedAt`.

The three paginated export reads have matching `{ userId: 1, id: 1 }` indexes.
`academic.currentContext` is cursorless and may be empty. Its export projection never repairs persistence:
invalid subject references are omitted in memory, invalid/withdrawn affiliation
contexts produce an empty section, and export does not call context mutation or
append Academic audit events. The export path uses a dedicated pure Mongo
`findOne().lean()` lookup rather than Academic's normalizing context getter.
For legacy rows with no persisted revision, the portable projection reports
revision `1` in memory without rewriting the row or its timestamps.

Academic export contains relationship references and user-owned lifecycle state,
not the global Academic catalog. It does not export catalog source provenance,
admin audit events or internal context guard revisions.

`academic.proposals` filters on the exact proposal `userId` and selects only
the stable proposal id, kind, proposed name, parent ids, optional owner-entered
evidence URL/notes and creation time. Parent ids remain opaque references;
export does not resolve catalog nodes or alter canonicalization. The read uses
immutable `id ASC`, `limit + 1`, a maximum page size of 100 and the
`{ userId: 1, id: 1 }` index. Missing optional evidence/notes are serialized
as `null`. Proposal status, update time, reviewer identity/time/reason,
canonical target, audit records and catalog source provenance are excluded;
this is a snapshot of the user's submission, not a moderation outcome.

### Implemented Q&A authored sections

Q&A contributes two owner-scoped sections:

- `qa.authoredQuestions` — the account owner's question id, academic context
  references, title, body, open/closed state and timestamps;
- `qa.authoredAnswers` — the account owner's answer id, its Question id
  reference, body and timestamps.

Both sections read only rows authored by the owner through explicit Mongo field
allowlists and stable `id ASC` cursors. The page limit is capped at 100 and the
queries use `{ authorUserId: 1, id: 1 }` indexes. Hidden authored content is
included for the owner, but the authored-content sections omit moderation metadata,
search text, answer counts, accepted-answer pointers, internal revisions and
author user ids. An answer references its Question by id only; the export
does not resolve or include another author's Question content.

### Implemented Q&A submitted reports section

`qa.submittedReports` contains only `QaReport` rows whose `reporterUserId`
exactly matches the export owner. Each portable record contains the stable
report `id`, `targetType`, `targetId` as an opaque reference, the owner's
`reason` and `details`, and `createdAt`. A missing or moderated target remains
an opaque reference; export does not resolve the Question or Answer.

Pages use immutable `id ASC`, `limit + 1`, a maximum page size of 100 and the
`{ reporterUserId: 1, id: 1 }` index. The query-time projection excludes report
status, update time, reviewer identity/time/reason/action and all target
content. This is the owner's submission, not moderation history.

### Implemented social relationship sections

Social contributes two owner-scoped relationship sections:

- `social.following` — the account's current outgoing Follow relations, each
  represented by the followed Profile id and the Follow creation time;
- `social.connections` — the stored Connection row for each direct relation in
  which the account participates, including its current status, whether the
  owner requested it, and creation, response and update timestamps.

Following is ordered by `createdAt DESC, id ASC`; Connections are ordered by
`updatedAt DESC, id ASC`. Each query uses an owner/participant filter, an
explicit Mongo field allowlist and `limit + 1` to determine continuation. The
export page limit is capped at 100. Following uses the existing
`{ followerUserId: 1, createdAt: -1, id: 1 }` index. Connections use separate
`{ userLowId: 1, updatedAt: -1, id: 1 }` and
`{ userHighId: 1, updatedAt: -1, id: 1 }` indexes so either participant arm
can seek in export order.

The portable Follow record contains only `followeeProfileId` and `followedAt`.
The portable Connection record contains only `counterpartProfileId`, `status`,
`requestedByOwner`, `createdAt`, `respondedAt` and `updatedAt`. Counterpart
Profile ids are resolved in a separately bounded allowlist read; a missing
Profile identity or a corrupt row that does not contain the owner aborts the
page instead of emitting an incomplete or misattributed record. Closed Profile
tombstones remain resolvable through their stable Profile id.

Incoming follower lists, counterpart names, emails, avatars, internal user
ids, notifications and counterpart Profile content are not exported. Following
is a snapshot of current outgoing edges: an unfollowed edge is no longer stored
and is not a revocation history. A Connection row is the domain's current
relationship record, not an event log of every request/reopen transition.
These relationship projections do not grant access to counterpart data and
do not make the full account export complete.

### Implemented notification inbox section

Notifications contributes `notifications.inbox`, containing all notification
records addressed to the export owner. Each portable row contains the owner's
notification id and type, nullable `actorProfileId`, target type/id as a
reference, `readAt` and `createdAt`. It preserves both read and unread inbox
state; it does not resolve or include target content.

The store filters by owner and uses an explicit field allowlist. Pages are
ordered by `createdAt DESC, id ASC`, use `limit + 1`, and are capped at 100.
The existing `{ userId: 1, createdAt: -1, id: 1 }` index supports this export
order. The query does not read notification `updatedAt` or the owner's user id
into the portable row. Non-null actor user ids are resolved in a separately
capped Profile-id projection; a missing actor Profile aborts the page. A null
actor stays null.

The export contains no actor names, emails, avatars or internal user ids; no
notification provider/delivery data; and no Question, Answer, Connection or
Profile content behind a target reference. The target reference is not access
authority. These inbox records remain a partial contributor and do not make
the overall account export complete.

### Implemented Organization following section

Organizations contributes the partial owner-scoped section
`organizations.following`. It is a snapshot of the owner's current
OrganizationFollow edges. Each portable record contains only the stable
`organizationId` reference and `followedAt` timestamp. The read filters by the
owner and selects only those two fields; it does not resolve the Organization.

Pages use `createdAt DESC, organizationId ASC`, an opaque cursor,
`limit + 1`, and a maximum page size of 100. The
`{ userId: 1, createdAt: -1, organizationId: 1 }` index supports this order.
An archived or missing target does not erase the owner's stored follow row;
the export preserves the edge as stored without inferring target lifecycle.

The following section does not resolve or include Organization names,
metadata, management roles, members or linked content. The owner's own current
management assignments, when present, use the separate section below.
Unfollowed edges are not available as a revocation history. A follow reference
does not transfer Organization ownership, management authority or access to
the target.

### Implemented Organization management section

The partial owner-scoped section `organizations.management` is a snapshot of
current `OrganizationManager` rows whose `userId` exactly matches the export
owner. Each portable record contains only the stable `organizationId`, current
`role`, `createdAt` and `updatedAt` timestamps. The query does not resolve or
include Organization data.

Pages use `organizationId ASC`, a section-bound opaque cursor, `limit + 1`,
and a maximum page size of 100. The existing
`{ userId: 1, organizationId: 1 }` index supports the owner filter and stable
order. A missing or archived target does not erase the owner's stored manager
row; it remains a reference snapshot without inferring target lifecycle.

Other managers and members, Organization audit events, revoked-role history,
invitations and linked content are excluded. The role and timestamps are
informational account data; they do not grant or transfer management
authority. This partial section is not a management audit log or a completeness
claim.

### Implemented Organization submitted reports section

The partial owner-scoped section `organizations.submittedReports` contains
only `OrganizationReport` rows whose `reporterUserId` exactly matches the
export owner. Each portable record contains the stable report `id`,
`targetType`, `targetId` as an opaque reference, the owner's `reason` and
`details`, and `createdAt`. A missing or moderated target remains a reference;
the export does not look it up.

Pages use `id ASC`, a section-bound opaque cursor, `limit + 1`, and a maximum
page size of 100. The `{ reporterUserId: 1, id: 1 }` index supports the owner
filter and stable order. The query selects only the portable fields.
`status`, `updatedAt`, reviewer identity, review time, review reason and review
action are excluded, along with target content and reports submitted by other
users. This is the owner's submission data, not a moderation outcome, audit
history or access grant.

### Implemented Organization-authored Posts and Events

The owner-authored sections `organizations.authoredPosts` and
`organizations.authoredEvents` preserve current Organization content whose
`createdByUserId` exactly matches the export owner. Post rows contain their
stable id, Organization and Subject references, title/body and publication
and record timestamps. Event rows contain their stable id, Organization
reference, owner-entered event details, current scheduled/cancelled state,
external URL and timestamps.

Both collections use an author-only filter, a query-time allowlist, immutable
`id ASC` pagination, `limit + 1` and a maximum page size of 100. The
`{ createdByUserId: 1, id: 1 }` indexes support their export order. Hidden
authored content remains included so moderation does not erase the author's
own saved contribution, but moderation state, internal revision counters,
reports, reviewer identity/actions and other authors' records are excluded.

The Organization reference does not resolve Organization metadata or provide
access to its shared content. This is current authored content, not a deleted
Post/Event history or a moderation audit log.

### Implemented Organization curation sections

The partial owner-scoped section `organizations.authoredLinks` contains
current `OrganizationLink` rows whose `createdByUserId` exactly matches the
export owner. Each record contains the stable link id, opaque
`organizationId`, owner-entered label and HTTPS URL, and creation/update
timestamps. It uses `id ASC`, a section-bound cursor, `limit + 1`, a maximum
page size of 100, and the `{ createdByUserId: 1, id: 1 }` index.

The partial owner-scoped section `organizations.featuredResources` contains
current featured-resource relations whose `createdByUserId` exactly matches
the export owner. Records contain only opaque `organizationId` and
`resourceId` references plus relation timestamps. The tuple order is
`organizationId ASC, resourceId ASC`; its cursor is section-bound, pages read
`limit + 1`, the maximum page size is 100, and the
`{ createdByUserId: 1, organizationId: 1, resourceId: 1 }` index supports the
query. Neither section resolves Organizations or Resources. Featured
references do not include Resource content, transfer ownership, make private
Resources readable, or grant management authority. Removed curation and
historical changes are outside these current-state snapshots.

### Implemented Resource history sections

Resources contributes four owner-scoped sections:

- `resources.authored` — the user's own Resource metadata, including private
  and hidden authored history, current visibility/moderation state, academic
  references and timestamps;
- `resources.saved` — the user's saved Resource references and save time;
- `resources.sharedGrants` — the user's currently active explicit sharing
  grants over Resources they authored, including each recipient's stable
  Profile id and the grant creation time;
- `resources.submittedReports` — the user's own Resource report submissions,
  with an opaque Resource reference and the report text they supplied.

Authored Resources use a query-time field allowlist and immutable `id ASC`
pagination with a `{ authorUserId: 1, id: 1 }` index. The caller's page limit
is validated at no more than 100 and Mongo reads `limit + 1` to determine
continuation. `resources.saved` reuses the existing bounded save relation
ordering and cursor. It intentionally exports the owner's save record even if
the target is no longer readable; it never resolves target content or grants
access to it.

These metadata sections do not include FileAsset ids, object keys, filenames,
signed URLs or file bytes. `resources.sharedGrants` is a snapshot of current
grants, not a revocation log. Its portable record contains only `resourceId`,
`granteeProfileId` and `grantedAt`; recipient names, emails, internal user ids
and Profile contents are not included. Profile ids are resolved through a
query-time allowlist that reads only the stable Profile id and its owning user
id. Closed Profile tombstones remain resolvable; a missing recipient Profile
fails the page so the assembler aborts rather than publishing an incomplete
projection.

Share export pages seek through the owner's ordered Resource ids and read
grants in `{ resourceId: 1, userId: 1 }` order with `limit + 1`. The cursor can
resume within one Resource or advance beyond a bounded batch of authored
Resources that contain no grants. The existing author/id and unique
resource/user indexes bound both reads; the adapter never materializes all of
the owner's Resources or grants at once.

The Resource/FileAsset lifecycle contract remains independent: creator
provenance and a Resource reference do not authorize deletion or byte access.
Submitted report rows use the exact `reporterUserId` owner filter, an explicit
projection, `id ASC`, `limit + 1`, a maximum page size of 100 and the
`{ reporterUserId: 1, id: 1 }` index. Their portable fields are `id`,
`resourceId`, `reason`, `details` and `createdAt`; absent details normalize to
`null`. Report status, update time, reviewer identity/time/reason/action,
Resource content, FileAsset metadata and file bytes are excluded. The Resource
reference is not resolved and grants no access. These sections remain partial
contributors and do not make a complete downloadable account export.

### Implemented Feed preference and feedback sections

Feed contributes `feeds.preferences` and `feeds.feedback`. Preferences include
only a row that already exists for the exact owner: the three user-controlled
switches, muted Subject/Profile references, prioritized Subject references,
and creation/update timestamps. These arrays retain the existing write
limits (100 muted references and 50 prioritized Subjects). The export path
uses a read-only query; it never calls `getOrCreatePreferences`, performs an
upsert, or synthesizes defaults. An account without a stored row gets an empty section. The internal
preference `revision` is excluded.

Feedback exports each current owner row as `targetType`, opaque `targetId`,
`signal`, `createdAt` and `updatedAt`. It reads no target, author, or linked
content, and the portable record contains no internal user id. The bounded
keyset order is `{ targetType: 1, targetId: 1 }`; it uses `limit + 1`, a
maximum requested size of 100, and the existing unique
`{ userId: 1, targetType: 1, targetId: 1 }` index. This stable identity order
does not change when `updatedAt` changes after a feedback edit. The section is
current explicit feedback, not an event or ranking history.
Neither section changes Feed behavior or grants authority over a referenced
Subject, Profile, Resource, Question, or Organization Post.

These remain partial contributors; they do not add a public endpoint or make
the account export complete or downloadable.

### Implemented File upload metadata section

Files contributes the partial owner-scoped section `files.uploads` for
persisted `FileAsset` rows whose `creatorUserId` exactly matches the export
owner. Each record contains the stable asset id, original filename, declared
MIME type, nullable verified MIME type, expected byte size, nullable actual
byte size and creation time. This is upload metadata only; it does not assert
that the bytes remain available or provide a download path.

Pages use immutable `id ASC` keyset order, a section-bound opaque cursor,
`limit + 1`, and a maximum page size of 100. The
`{ creatorUserId: 1, id: 1 }` index supports the exact creator filter and
continuation. The Mongo query selects only portable metadata fields. FileAsset
creator provenance is not Resource ownership, byte deletion authority or
download authority; export does not resolve a Resource or emit its `claimRef`.

`creatorUserId`, Mongo `_id`, provider, `objectKey`, etag, upload operation
keys/fingerprints, lifecycle state, failure codes, scan/reclamation claims and
timestamps, signed URLs and bytes are excluded. The partial inventory does
not change File lifecycle or retention and does not make the overall account
export complete or downloadable.

### Implemented Pilot activity section

Pilot contributes the partial owner-scoped section `pilot.activity` from its
existing `pilot_events` telemetry rows. It includes only records whose
`userId` exactly matches the export owner. Each portable row contains the
stable event id, allowlisted event name, optional opaque `subjectId`, optional
numeric `resultCount`, and `createdAt`; absent optional dimensions are
serialized as `null`.

Pages use ascending `{ createdAt: 1, id: 1 }` keyset order, read `limit + 1`,
and are capped at 100. The `{ userId: 1, createdAt: 1, id: 1 }` index supports
the owner filter and continuation. The query selects only portable fields and
does not include the internal owner id or Mongo `_id` in the artifact. The
section preserves only telemetry already written; events without an
authenticated `userId` do not appear, and export does not backfill attribution.

This is a best-effort activity history, not a complete event ledger or audit
trail. Aggregate metrics, other users' events, query text, content, IP address,
user agent, moderation/audit data, target lookups and behavior changes are
excluded. A Subject reference remains opaque and grants no access. The section
does not make the overall account export complete or downloadable.

## Implemented internal streaming artifact assembly

The internal v1 artifact is a compact JSON envelope:

```json
{"format":"los-apuntes-account-export","version":1,"sections":{"academic.affiliations":[...],"academic.currentContext":[...],"academic.follows":[...],"academic.proposals":[...],"academic.subjectParticipations":[...],"account":[...],"auth.externalIdentities":[...],"feeds.feedback":[...],"feeds.preferences":[...],"files.uploads":[...],"notifications.inbox":[...],"organizations.authoredEvents":[...],"organizations.authoredLinks":[...],"organizations.authoredPosts":[...],"organizations.featuredResources":[...],"organizations.following":[...],"organizations.management":[...],"organizations.submittedReports":[...],"pilot.activity":[...],"profile":[...],"profile.activities":[...],"qa.authoredAnswers":[...],"qa.authoredQuestions":[...],"qa.submittedReports":[...],"resources.authored":[...],"resources.saved":[...],"resources.sharedGrants":[...],"resources.submittedReports":[...],"social.connections":[...],"social.following":[...]}}
```

Section keys follow the contributor registry's stable lexicographic order.
Records preserve each contributor's cursor order. The assembler writes the
envelope and each serialized record as separate awaited sink chunks, and it
reads at most the existing 100-record contributor page budget at a time. It
does not collect an entire section or export into an in-memory array. Cursor
cycle detection retains only a constant-size checkpoint per section.

The sink is attempt-scoped and stages output privately. Any contributor,
serialization, sink-write or commit failure aborts the partial output and
preserves the original failure; a caller must not publish or persist
completion metadata for an aborted attempt. The assembler calls `commit` only
after writing the complete envelope and calculating its integrity result.
Only a successful commit lets the assembly return successfully. On success,
the internal assembly result also returns the exact envelope's UTF-8 byte
length and SHA-256 hex digest. Both are calculated incrementally after each
awaited sink write, so the assembler does not retain artifact bytes to compute
integrity metadata. These values are internal attempt metadata and must not be
logged or exposed as public download authority. The assembler is not a
downloadable export: durable artifact storage, worker orchestration,
owner-reauthorized request/status/delivery and the public HTTP surface remain
open. No generated output may be presented as complete to an account owner
until the complete artifact path is implemented and verified.

### Durable completion boundary

The durable job model has a terminal `completed` transition for a worker to
record only after the artifact sink has committed the complete envelope. The
store uses a compare-and-set on job id, `processing`, the active slot, exact
claim id and an unexpired lease. A stale or expired claim returns no success
and writes no completion metadata. Successful completion records the format
version, completion time, section and record counts, byte length and SHA-256;
it clears claim/lease state and releases the active processing slot.

These fields are internal job metadata, not a public status or download
capability. Provider ids, object keys and signed URLs are not persisted in the
job. This transition does not add a concrete artifact store, worker, expiration
policy, endpoint or delivery route, and does not assert that a downloadable
artifact currently exists. Legal retention horizons and backup purge
guarantees remain separate decisions.

### Lease-fenced retry transitions

Retryable and terminal failure transitions use the same job id, active slot,
`processing` state, exact claim id and unexpired lease fence as completion. The
service supplies the current transition time; callers cannot backdate it. A
stale claim or expired lease returns no success and does not change the job.
Successful retries return the job to `pending` while retaining its active slot;
terminal failures become inactive. Both paths clear claim/lease and any old
completion metadata.

This does not set retry backoff or attempt limits, and does not add a worker,
artifact store, expiration policy, endpoint or delivery route.

### Safe failure codes

Retry transitions accept only the closed failure codes already defined by the
domain. Both the service and Mongo adapter reject unknown values before a job
write, and the schema declares the same enum. Arbitrary exception text and
export values cannot be persisted into the job's status field. Unknown
historical values are sanitized to `null` in the public status projection.

This does not choose retry timing, attempt limits or error classification.

### Service-owned worker leases

The service creates the claim id and initial bounded lease when it claims a
pending or expired job. A long-running assembly can renew only through the
current active processing claim while its lease remains unexpired. Renewal
extends monotonically, so a concurrent later extension is never shortened;
expired or replaced claims return false. Callers cannot supply lease timestamps.

This is a lease primitive for a future worker. It does not add a worker loop,
artifact sink/provider, retry schedule, retention policy or public endpoint.

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
- Organization management audit/member history, report review outcomes, Q&A
  attribution and Academic/Alumni history remain governed by their own domain
  contracts.

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

Resource authored metadata, saved references, current explicit share grants
and submitted report metadata are implemented partial contributors; Resource
file bytes and a historical revocation log remain outside them. Q&A authored
questions/answers and the owner's submitted reports, Social
Following/Connection history, the owner's Notification inbox, current
Organization follows and owner-authored Organization Posts/Events are also
implemented partial contributors. The owner's current Organization manager
roles and submitted reports are separate implemented partial contributors;
management/member history and report moderation outcomes remain outside the
current contributor set. Resource and Q&A reports also exclude moderation
outcomes and target content. Academic affiliation lifecycle state, including
its alumni status/roles, is carried by `academic.affiliations`. The API has no
separate Alumni data authority or contributor. User-authored Academic catalog
proposals now appear as the separate partial `academic.proposals` section;
moderation outcomes and catalog source provenance remain excluded. Persisted
Feed preferences and current explicit feedback now appear as partial
`feeds.preferences` and `feeds.feedback` sections without target lookups or
synthesized defaults. The current Google identity link appears as the partial
`auth.externalIdentities` section; it contains no provider credentials or
proofs. File upload metadata now appears as the partial `files.uploads` section,
without storage keys, scan internals, bytes or download authority. Pilot event
history appears as the partial `pilot.activity` section; it contains only
authenticated owner-attributed events and bounded dimensions. The presence of
core, Auth, Academic, Feed, Files, Pilot, Q&A, Resource and other partial
sections does not make the overall export product complete or ready for public
HTTP delivery.

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
