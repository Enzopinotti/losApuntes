# Persistence preflight 2026 — evidence before DER reconciliation

## Status

Prepared against:

`main @ 576b9dc76ccd630ff05f80bc337210203e781568`

Primary architecture issue: #3  
Downstream domain issues: #5, #10, #9, #6

This document does **not** choose MongoDB, PostgreSQL or a hybrid model.

Its purpose is to make the eventual decision fast, evidence-based and migration-aware once the real DER/class diagrams are available.

## 1. Inputs reviewed

### Historical product material

The historical LATAM documents describe:

- NestJS/TypeScript backend;
- MongoDB Atlas as the former high-level database choice;
- academic structure around University -> Faculty -> Career -> Subject -> Year/Semester;
- entities such as User, University, Career/Subject, Resource/Note, social relations, groups, Q&A, opportunities and payments;
- an explicit note that the high-level model still required technical design.

Those documents are product/history evidence. They do not override the 2026 domain contract.

### 2026 domain baseline

The accepted pre-DER contract requires, among other things:

- Account/security state distinct from Profile presentation;
- multiple simultaneous/historical AcademicAffiliations;
- CurrentAcademicContext as bounded server-revalidated state;
- Institution, optional Campus/AcademicUnit, Program, Curriculum, Subject and optional CourseOffering;
- canonical aliases/provenance/redirects;
- provisional academic proposals distinct from canonical data;
- Resource distinct from ResourceAsset;
- temporal history instead of one mutable career field;
- contextual capabilities instead of one scalar role.

### Current implementation

The active backend still uses MongoDB/Mongoose as the rescued persistence adapter.

That is an implementation fact, not an architecture decision for the future domain.

## 2. Current physical persistence inventory

### Runtime root

`AppModule` connects through `MongooseModule.forRootAsync` using `MONGO_URI`.

Mongo is currently also a readiness dependency and is present in the local/container runtime smoke.

### Current collections/models

#### users

Current `User` combines:

- username;
- email;
- password hash;
- email verification state;
- credential version;
- account status;
- scalar user/admin role;
- full name;
- avatar URL;
- bio;
- legacy `career_id`;
- legacy `cohort_year`.

The last two academic fields are not used by active product/domain code outside the schema/documentation. That means they can still be retired without migrating a large academic feature surface.

#### auth_sessions

Important physical guarantees:

- unique session ID;
- unique token hash;
- user ownership;
- credentialVersion fence;
- Web/Mobile client type;
- absolute expiry;
- last-seen timestamp;
- TTL cleanup;
- index for user session inventory.

#### auth_action_tokens

Important physical guarantees:

- unique token ID;
- unique token hash;
- user + purpose + issue-bucket uniqueness;
- purpose-scoped active lookup;
- credentialVersion binding for recovery;
- single-consume semantics through an atomic claim;
- TTL cleanup.

#### auth_external_identities

Important physical guarantees:

- provider + provider subject unique;
- provider + user unique;
- link conflict resolution;
- explicit unlink behavior.

#### auth_google_oauth_attempts

Important physical guarantees:

- unique attempt/state;
- nonce + PKCE verifier state;
- one-time consume through atomic delete;
- TTL cleanup.

## 3. Persistence-independent Auth invariants that must survive any migration

A future persistence change is invalid if it weakens any of these:

1. account email uniqueness;
2. full credentialVersion fencing;
3. opaque session hash-only storage;
4. session revoke-one/revoke-all semantics;
5. session absolute/idle lifetime behavior;
6. one-time action-token claim semantics;
7. action-token issue-bucket race safety;
8. Google subject uniqueness;
9. one Google identity per user in v1;
10. one-time OAuth attempt consumption;
11. exact account-status revalidation;
12. no public API dependency on Mongo ObjectId semantics.

The current Auth service/store boundaries are deliberately useful here: storage can move while Web/Mobile HTTP semantics remain stable.

## 4. Legacy fields that must not drive the new model

### `career_id`

Do not expand this into the Academic Graph.

Why:

- one user may have multiple simultaneous/historical affiliations;
- Program/Career is not enough to express Institution, Curriculum, Subject or CourseOffering context;
- current context is not equivalent to lifetime academic identity;
- alumni and transfers would overwrite history.

### `cohort_year`

Do not treat this as the universal academic time model.

The real DER must decide whether the pilot needs:

- year;
- semester/term;
- start/end precision;
- curriculum cohort;
- enrollment/admission year;
- offering period.

### scalar `role`

Keep it only as legacy/platform authority while the domain is reconciled.

Academic, organization and moderation capabilities must not be inferred from one mutually-exclusive user role.

## 5. Workload inventory to evaluate against the real DER

The persistence ADR must evaluate actual flows, not abstract database popularity.

| Workload | Core reads/writes | Required guarantees |
| --- | --- | --- |
| Account bootstrap | User + Profile + current context | bounded latency; no stale authorization |
| Find institution/program/subject | catalog lookup + aliases | stable IDs; scoped uniqueness; provenance |
| Select/switch academic context | affiliation/participation validation + current selection | server authority; history preserved |
| Academic affiliation lifecycle | create/update/end affiliation | temporal correctness; multiple legal affiliations |
| Subject participation | current/history relation | no overwrite of prior participation |
| Catalog import | upsert by source identity | reproducible source mapping; dedup; audit |
| Catalog rename/inactivate | canonical update | incoming references remain valid |
| Catalog merge | redirect deprecated -> canonical | no redirect loops; audit; references resolve |
| Provisional proposal | create/review/accept/reject | never silently canonicalize |
| List people/resources by subject | relationship fan-out | privacy/visibility filtering |
| Resource finalization | resource + asset + academic context | idempotency; authorization |
| Save/bookmark | user-resource relation | uniqueness; save never grants access |
| Follow/social edge | user/object edge | duplicate prevention; privacy |
| Report/moderation | report + target + action/history | durable attribution/audit |

The real DER should annotate expected cardinality/fan-out for each flow.

## 6. Candidate persistence observations before the DER

These are observations, not a score or final selection.

### Keep MongoDB/Mongoose

Advantages already proven locally:

- no migration of the current Auth runtime;
- existing tests/smoke remain close to current implementation;
- simple TTL indexes for ephemeral Auth records;
- team already has working adapters and operational scripts.

Questions the DER must answer:

- can all academic referential-integrity rules remain explicit and testable without excessive application-level coordination?
- how will many-to-many catalog/affiliation/history relationships be modeled?
- how will canonical merges/redirects and uniqueness scopes remain race-safe?
- how will migration/version discipline work once the domain becomes richer?

### Move primary transactional persistence to PostgreSQL

Potential advantages to evaluate:

- explicit foreign-key/reference constraints;
- unique/partial/index constraints around canonical data and edges;
- relational many-to-many/history queries;
- transaction boundaries for canonicalization/merge workflows;
- mature migration tooling and explicit schema evolution.

Costs to evaluate:

- migrate current User/Auth persistence;
- replace Mongoose runtime/config/health adapters;
- rewrite container/runtime smoke;
- choose ORM/query/migration tooling;
- prove equivalent Auth race semantics;
- operational change before domain feature delivery.

### Hybrid

Do not choose hybrid by default.

A second primary datastore is justified only by a concrete workload that materially benefits from it and whose consistency/operational cost is understood.

Search, analytics, object storage and caches may become separate projections/services later without making the primary transactional model “hybrid” by default.

## 7. Migration blast radius if PostgreSQL is selected

The public Auth contract should stay stable.

Expected internal migration surface:

- application persistence bootstrap;
- configuration from `MONGO_URI` to final DB config;
- readiness dependency;
- local Compose/runtime image;
- CI runtime smoke;
- User repository/service adapter;
- AuthSession store;
- AuthActionToken store;
- GoogleExternalIdentity store;
- GoogleOAuthAttempt store;
- TTL cleanup strategy;
- index/constraint definitions;
- test fixtures/integration harness;
- production backup/restore/migration runbooks.

A migration must prove behavioral parity before deleting Mongo support.

## 8. Safe migration strategy if the decision changes

If PostgreSQL wins after DER reconciliation:

1. freeze the HTTP/domain contracts first;
2. introduce repository/store interfaces where a direct Mongoose dependency still leaks;
3. implement PostgreSQL adapters behind the same contracts;
4. add integration tests against both persistence implementations during transition where valuable;
5. design explicit migrations for User/Auth;
6. preserve stable account/session/action-token identifiers where externally meaningful;
7. run dual verification on staging data, not dual writes by default;
8. cut runtime/health/Compose only after parity tests are green;
9. remove Mongo only after backup/rollback evidence exists.

Do not perform an uncontrolled “schema rewrite” directly inside controllers/services.

## 9. What is still missing

The actual DER/class diagrams were **not found** in the currently available Project files.

The available historical documents contain only high-level entities/hierarchy.

Before #3 can choose persistence, the real diagrams must be supplied and reconciled with:

`docs/domain/der-reconciliation-checklist.md`

Minimum missing evidence:

- diagram file/version/date;
- entities and exact relationships;
- cardinalities;
- optional/mandatory relationships;
- temporal fields;
- inheritance/generalization if any;
- unique keys/business identifiers;
- intended deletes/cascades;
- any original database assumptions.

## 10. Immediate go/no-go

### Safe now

- continue Auth/runtime hardening already completed;
- document migration boundaries;
- prepare import/source strategy;
- prepare workload fixtures and contract tests;
- inspect official catalog sources;
- define API/domain semantics independent of persistence.

### Not safe yet

- create final academic collections/tables;
- migrate `career_id`;
- choose an ORM;
- remove Mongo;
- introduce PostgreSQL in production;
- implement Catalog entities with guessed cardinalities;
- hard-code one university/career per user.

## 11. Decision trigger

#3 can move from preflight to decision only when the real diagrams are available and the reconciliation produces:

1. annotated mapping to the 2026 domain contract;
2. contradiction list;
3. MVP pruning;
4. final conceptual cardinalities;
5. workload/cardinality inventory;
6. candidate comparison using that evidence;
7. chosen persistence model;
8. migration impact and rollback plan.

At that point ADR 0004 can move from **Proposed / blocked by DER** to **Accepted** with the actual database decision.
