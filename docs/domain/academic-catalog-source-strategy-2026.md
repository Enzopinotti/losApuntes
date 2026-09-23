# Academic Catalog source strategy 2026

## Status

Prepared on 2026-09-22 for issue #10.

This document defines **source authority, provenance and import rules** for the canonical academic catalog independently from the physical database schema.

Academic Graph v1 now implements the catalog behind the replaceable `AcademicStore` boundary. The source strategy remains authoritative for provenance/import behavior, while the future NotebookLM DER may revise the physical representation.

## 1. Why source strategy comes before persistence

The Academic Catalog is not just a list of names.

Los Apuntes needs to know:

- where a catalog fact came from;
- whether the source is official, institutional, community-proposed or manually curated;
- when the source was observed;
- whether it can be imported reproducibly;
- whether a rename/inactivation is authoritative;
- whether two names are aliases or distinct entities;
- whether a user proposal is still provisional;
- whether old links must redirect after a merge.

Those rules exist regardless of MongoDB or PostgreSQL.

## 2. Source classes

### Tier A — national authoritative source

Government/university-system sources that describe official institutions or academic offers.

For Argentina, currently verified references include:

- Secretaría/Subsecretaría de Políticas Universitarias — Instituciones Universitarias:
  https://www.argentina.gob.ar/educacion/universidades/informacion-universitaria/instituciones-universitarias
- Guía de Carreras Universitarias / SIU:
  https://guiadecarreras.siu.edu.ar/
- Datos Argentina — datasets de instituciones/ofertas universitarias:
  https://datos.gob.ar/dataset?tags=Instituciones+Universitarias
  https://www.datos.gob.ar/dataset/spu-ofertas-educacion-superior-instituciones

Tier A does **not** mean every published file is current enough for automatic import. Freshness and machine-readability are evaluated per source artifact.

### Tier B — institution authoritative source

Official university/faculty/program sources, for example:

- official institution website;
- official study-plan/curriculum publication;
- official faculty/school catalog;
- official resolution or academic offer document;
- official API/feed if one exists.

Tier B is especially important for Curriculum/Plan and Subject, where a reliable national registry may not expose the full detail needed by Los Apuntes.

### Tier C — curated administrative source

Data entered or corrected by Los Apuntes operators using evidence from Tier A/B sources.

Every curated change must retain:

- actor;
- reason/evidence;
- source URL/reference when available;
- prior value/history where required;
- timestamp;
- affected canonical IDs.

Tier C may resolve ambiguity; it must not erase provenance.

### Tier D — community proposal

User-submitted missing institution/program/subject/alias/correction proposal.

A proposal is never canonical merely because it was submitted.

It remains a separate lifecycle:

`pending -> accepted | rejected | duplicate | superseded`

Acceptance must create/update canonical data through an explicit review/canonicalization action.

## 3. Argentina source review — 2026-09-22

### 3.1 Current SIU Guide

The official Guía de Carreras Universitarias identifies itself as an official Argentine government site and states that it contains updated information for pregrado, grado and posgrado careers and the institutions where they are offered.

It currently exposes searchable institution and career pages, including fields such as:

- institution/university;
- faculty/academic unit;
- title/career;
- type of title;
- duration;
- admission conditions;
- locality/address/contact/web information.

**Use now:**

- authoritative verification/reference for current institution and program/offer existence;
- manual/admin reconciliation;
- source-of-truth candidate for a future reproducible adapter only after its machine interface and permitted usage are documented.

**Do not assume yet:**

- stable public API;
- stable HTML scraping contract;
- license/redistribution terms for bulk automated extraction;
- Subject/Curriculum detail.

No importer should depend on undocumented page HTML as a permanent contract.

### 3.2 Argentina.gob.ar institution CSV links

The current government page exposes CSV links for state and private university institutions.

However, the linked Google Drive filenames currently visible are:

- `estatal2020.csv`;
- `privada2020.csv`.

That mismatch between a current government page and historical-looking artifact names is a freshness warning.

**Use now:**

- historical/baseline cross-check;
- source-field discovery;
- external-code mapping investigation.

**Do not use as unattended 2026 canonical replacement** until the artifact contents, update date and ownership/freshness are verified.

### 3.3 Datos Argentina catalog

Datos Argentina still exposes datasets for:

- state higher-education institutions;
- private higher-education institutions;
- higher-education offers.

The visible dataset metadata currently shows old publication/update dates (2018/2019), even though some pages describe continuous or annual update frequency.

The institution resources expose useful source identifiers such as the Araucano institution code.

**Use now:**

- historical import fixture/reference;
- external identifier vocabulary;
- reproducibility experiments;
- comparisons against the current SIU Guide.

**Do not call the dataset current solely because its declared update frequency says “continuous” or “annual.”** Artifact-level observed freshness wins.

### 3.4 Statistical sources

University statistical annuals and SIU-Araucano/Wichi are useful for context, validation and aggregate analytics.

They are not automatically the canonical catalog source for every Institution/Program/Curriculum/Subject node.

Statistical facts and canonical identity must remain separate concerns.

## 4. Pilot-first catalog rule

The MVP should not wait for perfect national/global catalog completeness.

Before a broad import, complete one pilot academic context end to end using authoritative evidence:

1. Institution;
2. relevant Campus/Sede if applicable;
3. AcademicUnit if applicable;
4. Program/Career;
5. Curriculum/Plan if the pilot requires it;
6. Subject set required by the pilot;
7. aliases;
8. provenance;
9. lifecycle/status;
10. deterministic identifiers;
11. missing-data proposal path.

The pilot proves the model and import/reconciliation workflow before scale.

## 5. Source manifest contract

Every imported source snapshot should have a manifest independent of the future database.

Minimum conceptual fields:

| Field | Purpose |
| --- | --- |
| `sourceKey` | stable Los Apuntes identifier for the source |
| `authorityTier` | A / B / C / D |
| `jurisdiction` | country/region/institution scope |
| `sourceUrl` | canonical reference URL |
| `retrievedAt` | when Los Apuntes observed/downloaded it |
| `publishedAt` | upstream publication date when known |
| `upstreamUpdatedAt` | upstream last-update date when known |
| `contentFingerprint` | digest/version of imported content |
| `format` | csv/json/html/xlsx/pdf/manual |
| `licenseOrTerms` | known reuse terms or explicit unknown |
| `adapterVersion` | parser/mapper version |
| `status` | active, degraded, stale, retired |
| `notes` | bounded operational caveats |

Unknown values must remain unknown; do not invent dates/licenses.

## 6. Canonical record provenance contract

A canonical catalog node needs enough provenance to answer:

> Why does Los Apuntes believe this entity exists in this form?

Conceptually preserve:

- canonical product ID;
- sourceKey;
- upstream/external ID when available;
- source-observed name;
- normalized/display name;
- aliases;
- first observed time;
- last observed time;
- last verified time;
- upstream status when available;
- local canonical status;
- redirect/merge target if deprecated;
- source fingerprint/version;
- administrative override metadata where applicable.

Not every field has to live on one row/document. The final DER decides physical shape.

## 7. Identity and dedup rules

### Stable product identity

A source code, display name or URL is not the public product ID.

Los Apuntes must maintain a stable canonical ID so renames and upstream source changes do not break:

- profiles;
- affiliations;
- resources;
- links;
- saved items;
- search references.

### Names are not unique authority

Never deduplicate only on normalized display name.

Examples:

- two institutions can share similar abbreviations;
- the same program title can exist at many institutions;
- a Subject name can recur across programs/curricula;
- historical names may be aliases of a surviving entity.

### External IDs

When an authoritative source provides stable IDs such as Araucano institution codes, store them as source-scoped external identifiers:

`(sourceKey, externalId)`

Do not make an external ID from one provider the universal Los Apuntes identity.

## 8. Import behavior

An importer is a proposal generator for canonical state, not an unrestricted overwrite mechanism.

A deterministic import run should:

1. load a source snapshot + manifest;
2. validate required source fields;
3. normalize without losing raw/source values;
4. map known external identities;
5. classify rows as unchanged/new/changed/missing/ambiguous;
6. detect alias/collision candidates;
7. produce a bounded diff;
8. require review for destructive/ambiguous changes;
9. apply accepted changes idempotently;
10. record audit/provenance;
11. preserve redirects/history;
12. emit a machine-readable summary.

A rerun of the same source fingerprint and adapter version should not create duplicate canonical entities.

## 9. Deletion and disappearance

Upstream disappearance is not automatic hard deletion.

When an entity is absent from a new snapshot:

- mark it for review/staleness;
- keep existing incoming product relationships valid;
- distinguish “not observed” from “officially discontinued”;
- only inactivate/archive when authoritative evidence supports it;
- preserve historical references.

## 10. Alias and merge behavior

Alias creation and duplicate merge are different actions.

### Alias

Adds an alternate name/search key to the same canonical entity.

### Merge

Deprecates one canonical identity in favor of another.

Merge must:

- be auditable;
- preserve old IDs as redirects;
- prevent redirect loops;
- keep historical provenance;
- update canonical resolution without destroying incoming relationships.

## 11. Provisional proposal behavior

When onboarding cannot find data, the user flow should continue.

The proposal should capture enough evidence for review without manufacturing canonical truth.

Conceptual fields may include:

- proposer account;
- proposed type;
- proposed name;
- parent/context hints;
- institution/source URL;
- free-text evidence;
- submitted time;
- review state;
- duplicate/canonical target;
- reviewer/reason.

Do not expose unreviewed proposals in contexts that imply official verification.

## 12. Source freshness policy

Each source gets a freshness expectation.

Initial categories:

- **live/reference** — current site/service used for verification;
- **scheduled snapshot** — upstream publishes on a known cadence;
- **historical fixture** — useful for tests/migration but not current truth;
- **manual institutional** — maintained from official evidence;
- **unknown freshness** — cannot be automatically trusted for destructive updates.

The system should compare observed metadata/content fingerprints rather than trusting a marketing label like “continuously updated.”

## 13. Adapter policy

Each machine source needs an explicit adapter contract.

An adapter owns:

- fetch/input format;
- parsing;
- source field mapping;
- normalization;
- source identity extraction;
- validation;
- deterministic output;
- error reporting.

An adapter does **not** own:

- global canonical identity decisions;
- duplicate merges;
- authorization;
- UI;
- database-specific persistence assumptions.

This keeps source ingestion testable independently from the current Mongo adapter and compatible with ADR 0004.

## 14. Failure and degraded-source behavior

If an external source fails or changes format:

- existing canonical catalog remains readable;
- import fails closed;
- no partial destructive update;
- last successful snapshot/provenance remains known;
- operator gets a bounded failure summary;
- source can enter `degraded` state;
- user onboarding can still use already-canonical data and provisional proposals.

External availability must not become login/runtime availability.

## 15. Privacy boundary

Catalog imports contain institutional/catalog facts, not student identity.

Do not import nominal student records from SIU/Araucano or other systems merely because such data exists.

Academic affiliation in Los Apuntes is a separate user/product relation with its own verification/privacy rules.

## 16. Testing strategy before persistence

We can test source adapters without a final DB.

Fixtures should cover:

- exact rerun/idempotency;
- rename;
- alias;
- duplicate-name ambiguity;
- source ID stability;
- missing row;
- malformed row;
- unexpected column;
- encoding/accent normalization;
- blank optional hierarchy;
- conflicting parent context;
- stale snapshot;
- upstream code reuse/collision;
- destructive diff requiring review.

These tests should consume adapter-neutral normalized records, not Mongoose/SQL models.

## 17. Initial Argentina implementation sequence

### Phase A — pilot evidence

- choose the pilot institution/context;
- collect official institution/program/curriculum/subject sources;
- record source manifests;
- manually reconcile ambiguous naming;
- validate the future DER against this real graph.

### Phase B — national institution baseline

- evaluate the current SIU Guide against government CSV/Datos Argentina identifiers;
- establish stable external-ID mapping;
- determine legal/technical bulk access;
- build a reproducible Institution adapter only after the source contract is stable.

### Phase C — programs/offers

- use current official SIU Guide / official institutional sources;
- distinguish Program/Career from title/credential if the real DER requires it;
- never infer Curriculum or Subject from a title listing alone.

### Phase D — curriculum/subjects

- institution-specific official sources/adapters;
- community proposals only as provisional fallback;
- dedup/review before canonicalization.

## 18. Open decisions that still require the DER/pilot

- Program versus awarded Title identity;
- reusable Subject identity versus curriculum-scoped subject membership;
- Curriculum version boundaries;
- CourseOffering requirement for MVP;
- exact parent cardinalities for multi-campus/multi-unit programs;
- source precedence when two authoritative sources disagree;
- whether national imports are full snapshots or incremental feeds;
- pilot institution and pilot career.

## 19. Definition of source-adapter/pilot readiness

The Academic Graph backend is already implementable and implemented behind a persistence boundary.

A real source adapter or launch pilot is ready when:

- the target institution/context is selected;
- its authoritative source set is recorded;
- source manifests and normalized adapter output are defined;
- import diff/review semantics are agreed;
- canonical/provisional/alias/merge semantics remain covered by tests;
- usage/licensing constraints of automated bulk sources are known;
- ambiguous source precedence is documented for that adapter/pilot.

The future DER is reconciled as architecture evidence and may trigger a persistence migration, but it is not a prerequisite for continuing module development.
