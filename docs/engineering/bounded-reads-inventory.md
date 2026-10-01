# Bounded reads inventory

**Canonical issue:** #88  
**Status:** closure inventory for Web/API growth surfaces.

This document is the source of truth for list/read cardinality. A list is not
considered safe merely because one caller currently passes a small number.

## Rules

Every potentially growing read must be one of:

1. **cursor page** — stable ordering + bounded page + continuation;
2. **honest bounded window** — bounded read that exposes truncation;
3. **domain cap** — the collection itself has a durable write-time capacity;
4. **bounded decision snapshot** — incomplete data fails closed;
5. **bounded top-N** — deliberate discovery/ranking output that does not claim
   to be a complete inventory.

A UI must not present a bounded top-N/window as complete history.

Mongo cursor reads use a stable tie-breaker and request at most `limit + 1`
when they need a has-more sentinel.

## Inventory

| Surface | Public budget | Continuation / overflow | Stable order / index basis | Classification |
| --- | --- | --- | --- | --- |
| Global Search | default 8, max 20 per scope | none by design; result is top-N discovery | delegates to bounded Resource / Academic / Profile search | bounded top-N |
| Contextual discovery | max 8 Subjects × 8 Resources | none by design; contextual recommendation | canonical Subject ids + bounded Resource search | bounded fan-out/top-N |
| Academic catalog search | default 25, max 50 | opaque cursor | status/kind/normalizedName/id | cursor page |
| Academic affiliations | visible 50; decision 128 | visible `truncated`; decision overflow fails with `ACADEMIC_INVENTORY_OVERFLOW` | userId/status/updatedAt/id | honest window + decision snapshot |
| Academic Subject participations | visible 100; current decision 256 | visible `truncated`; decision overflow fails closed | userId/state/updatedAt/id | honest window + decision snapshot |
| Academic follows | visible 100; lifecycle 256 | `truncated` / `followsTruncated` | userId/updatedAt/id | honest window |
| Profile activities | default 20, max 50 | opaque `createdAt + id` cursor | userId/createdAt/id | cursor page |
| Resource search | default 25, max 50 | opaque `updatedAt + id` cursor | subject/visibility/moderation + updatedAt/id | cursor page |
| Saved Resources | default 25, max 50 | opaque `createdAt + resourceId` cursor | userId/createdAt/resourceId | cursor page |
| Q&A Questions | default 25, max 50 | opaque cursor | moderation/subject + updatedAt/id | cursor page |
| Q&A Answers | default 25, max 50 | opaque `createdAt + id` cursor | questionId/createdAt/id | cursor page |
| Social Following | default 50, max 100 | opaque cursor | followerUserId/createdAt/id | cursor page |
| Social Connections | default 50, max 100 | opaque cursor | user side/status/updatedAt + stable id | cursor page |
| Organization search | default 25, max 50 | opaque normalizedName/id cursor | institution/status/normalizedName/id | cursor page |
| Organization Posts | embedded 10; endpoint default 20, max 50 | opaque `publishedAt + id` cursor | organizationId/moderationState/publishedAt/id | cursor page |
| Organization Events | embedded 10; endpoint default 20, max 50 | opaque `startsAt + id` cursor | organizationId/startsAt/id | cursor page |
| Organization managers | 20 total | overflow is invariant violation / write rejected | organizationId/userId | durable domain cap |
| Organization useful links | 20 total | create rejected transactionally at cap | organizationId + collection epoch | durable domain cap |
| Organization featured Resources | 20 total | feature rejected transactionally at cap | organizationId/resourceId + collection epoch | durable domain cap |
| Notifications list | default 30, max 100 | opaque cursor | userId/readAt/createdAt/id | cursor page |
| Notification fan-out | max 50 unique recipients / 50 rows | stable overflow error | shared domain guard | amplification cap |
| Feeds | default 20, max 25; at most 3 product pages per cursor session | opaque context-bound cursor; natural break | bounded source candidate pools + revision/context cursor | bounded ranked pagination |
| Feed social relation snapshot | 500 + sentinel per relation family | explicit `truncated` | source list limits | bounded decision/input snapshot |
| Auth session inventory | visible 20 | `truncated`; current session preserved | userId/credentialVersion/clientType/lastSeenAt/sessionId | honest bounded window |
| Auth action tokens | keep 3 active per user/purpose | old rows invalidated by stable cutoff | userId/purpose/createdAt/id | bounded retention |
| Academic redirect resolution | depth 8; global traversal 256 | overflow/cycle fails closed | redirect ids | bounded graph fan-out |
| Pilot subject metrics | 100 + sentinel | overflow explicit/fail-safe | subject metric query scope | bounded ops aggregation |

## Web continuation requirements

Current Web list surfaces that expose a continuation must consume it rather than
silently rendering only page one.

Covered:

- Resource search;
- Saved Resources;
- Profile activities;
- Social lists;
- Q&A lists;
- Organization directory;
- Organization Posts;
- Organization Events;
- Notifications;
- Feeds.

Append operations deduplicate by durable entity id.

## Search and Feed correctness

Global Search is intentionally a top-N discovery response and has no cursor.
It must not be presented as complete history.

Feed has context/revision-bound cursors. Regression tests cover:

- stale cursor after preference revision;
- context mismatch;
- multi-page natural break;
- no entity id overlap across delivered pages.

## API-only bounded lists

Some administrative/reference APIs are bounded but currently have no Web or
Mobile infinite-list consumer, for example:

- Academic catalog children (max 50);
- Academic admin proposals (default 50, max 100).

They are **not** permission to build a client that claims completeness. Before a
product screen can require full traversal, the endpoint must gain cursor or
honest truncation metadata and a >1-page client test.

## Mobile

Current Mobile has no native list screen consuming `nextCursor`.

Therefore “Mobile > one page” is not applicable to the present product surface;
there is no hidden exemption for future work. Any new Mobile growing-list screen
must, before release:

1. consume the server cursor/truncation contract;
2. append without duplicate ids;
3. include a dataset larger than one page in automated acceptance;
4. handle stale/invalid cursor semantics where the server defines them.

Mobile already preserves Auth session `truncated + limit` metadata for its
future Security surface.

## Deliberately complete small lists

Lists such as Organization managers, useful links and featured Resources are
allowed to be rendered completely only because their capacity is enforced at
write time transactionally. A read-side `.limit()` alone is not considered a
domain cap.

## Closure audit

Before closing #88:

- no Web-active growing list may hide a tail without cursor/truncation;
- all cursor stores must have max/max+1 or continuation-predicate evidence;
- fan-out budgets must be shared at the side-effect boundary;
- Feed multi-page tests must prove no overlap;
- exact-head and post-merge CI/runtime smoke must be green.
