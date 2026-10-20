# B158 — Private network overview (backend v1)

## Problem and scope

The Network page and Profile need an inexpensive summary of current social
relationships without loading cursor-paginated following, follower, and
connection lists in the browser. This is a **read-only** view of the existing
Social authorities, not a new relationship store or a social ranking.

Related canonical requirements: SOC-FR-001, SOC-FR-002, SOC-FR-003,
SOC-NFR-001, PLAT-FR-001, NFR-SEC-001, NFR-PRIV-001 and NFR-PERF-001.

## GET /social/me/network-overview

Authentication: existing revocable AuthSession required. A restricted,
expired or unauthenticated account is rejected through the same server-side
guard as other private Social APIs. No request parameters; there is no
userId/profileId override and no anonymous projection.

Response, HTTP 200:

    {
      "followingCount": 4,
      "followersCount": 9,
      "acceptedConnectionsCount": 3,
      "pendingIncomingCount": 2,
      "pendingOutgoingCount": 1
    }

All five values are nonnegative integer counts. An empty account has five
zeros. No raw Account IDs, emails, private Profile sections, requester
identities, or relationship records are returned. Response header:
`Cache-Control: private, no-store`.

- `followingCount`: non-self stored Follow edges originating from caller.
- `followersCount`: non-self stored Follow edges targeting caller.
- `acceptedConnectionsCount`: accepted Connection pairs containing caller
  and a different participant, counted **once** per pair.
- `pendingIncomingCount`: pending pairs involving caller for which the
  *other participant* is the saved requester.
- `pendingOutgoingCount`: pending pairs involving caller for which caller
  is the saved requester.
- Declined and disconnected pairs are not counted as accepted or pending.
  Corrupt self-pairs and pending rows with a requester outside the pair are
  excluded from relevant counts.

Counts reflect currently stored relationship edges. If a target account has
no readable public Profile, list cards may be fewer than these totals. Do
not interpret follow as connection, academic affiliation or approval.

## Consistency and implementation

The server derives the owner exclusively from the verified AuthSession,
uses the existing `social_follows` and `social_connections` schemas and
their directional indexes, and performs five bounded `countDocuments`
queries. It does not load or hydrate relationship arrays.

Counts are a **best-effort read** rather than an atomic snapshot across five
queries. A simultaneous follow/accept/unfollow can produce briefly differing
totals; clients should refresh after mutations. A Mongo failure rejects the
whole request; no partial counts or synthetic zeros on error.

No changes to existing writes, notifications, feeds, ordering, data retention,
Web or Mobile. Use the existing mutation endpoints to follow, accept, decline
or disconnect. No new migration or feature flag.

## Acceptance and delivery

- Route is authenticated and private no-store; caller ID cannot be overridden.
- Directionality and accepted/pending isolation are tested.
- All count queries are anchored in the authenticated account and avoid
  counting malformed self-connections.
- Empty counts are defined; Mongo failure is propagated without fabricated
  results.
- Verify Jest, TypeScript, ESLint, Prettier, critical coverage, exact-head
  Quality Gate and production dependency audit before promotion.
- Keep the PR draft while dependency high/critical advisories or other
  mandatory release gates are unresolved. Merge != deploy.
