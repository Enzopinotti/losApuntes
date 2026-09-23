# Los Apuntes 2026 — Domain Contract pre-DER

## Status and purpose

This document is the conceptual contract for the Los Apuntes 2026 reboot before the real DER/class diagrams are available.

It captures product semantics that are already required by the 2026 product baseline. It does **not** decide SQL tables, Mongo collections, ORM models, aggregate boundaries, database vendor, API endpoint shapes or service decomposition.

The contract exists so a future DER can be checked against product truth instead of silently becoming product truth by itself.

## Sources represented

The contract consolidates explicit 2026 decisions already documented for product thesis, MVP/day-one experience, personal profile, academic catalog, alumni/lifelong university, campus organizations, resources/notes, social/network behavior, privacy, recommendation and moderation guardrails.

When this contract conflicts with an older rescued implementation, the current implementation is treated as legacy evidence, not as the desired domain.

---

## 1. Domain language and conceptual areas

### 1.1 Identity and account

**Account / User principal** is the authenticated product identity.

It owns security state such as credentials, verified login methods, account status and sessions. It is not the academic profile and it is not itself a university membership.

**Profile** is the user-facing representation of the person inside Los Apuntes.

Profile data may include display identity, optional bio/presentation, visual preferences, academic presentation, projects, interests and selected public/professional information.

**Session** is revocable authentication state used by a client. Web and mobile use one backend authority even if transport differs.

Conceptual rule:

> Authentication proves which account is acting. It never proves academic membership, permissions inside an organization or access to a resource.

### 1.2 Academic catalog

The canonical academic graph uses these conceptual levels where they actually exist:

- Country
- Institution
- Campus/Sede
- AcademicUnit such as Faculty/School
- Program/Career
- Curriculum/Plan
- Subject
- CourseOffering

These are not a mandatory fixed-depth tree.

A real institution may skip Campus, AcademicUnit or Curriculum. The domain must represent the structure that exists instead of fabricating hierarchy to satisfy one universal path.

**Subject** represents the durable academic identity of a matter/course in its canonical context.

**CourseOffering** represents a concrete delivery/cursada when period, commission, teacher, schedule, modality or another offering-specific fact matters.

### 1.3 Academic relationship of a person

**AcademicAffiliation** is the conceptual relationship between a person and an academic institution/program context over time.

It must be able to represent, when product scope requires it, applicant/pre-entry, active student, advanced student, recent graduate, alumni, mentor, teaching role, research role or another academic/community role.

These lifecycle semantics are not permission grants by themselves.

One person can have several simultaneous or historical affiliations.

**SubjectParticipation** is the conceptual relationship between a person and a Subject or CourseOffering.

It represents current or historical course relationship without turning “current subject” into a permanent field on User.

**CurrentAcademicContext** is the user's selected/derived working context for product navigation and personalization.

It is not independent authorization state. The server revalidates it against canonical and allowed relationships.

### 1.4 Canonical, alias and provisional academic data

A canonical catalog node has a stable product identifier independent from its display name.

Canonical academic entities may also have external source, external source identifier, aliases, lifecycle/status, source version/fingerprint, last verified state/time and redirects created by duplicate merges.

A **provisional academic entity/proposal** is not equivalent to a canonical catalog node.

It allows onboarding or contribution to continue when the catalog is incomplete, but it remains visibly pending and must not silently create a duplicate canonical node.

### 1.5 Resource / Note

A **Resource** is the product-level academic object users discover, save, share and report.

A Resource can represent an uploaded note/document or another supported academic resource type later.

A **ResourceAsset** is the binary/object-storage representation associated with a Resource.

Product access is decided from the Resource and its authorization context, never from knowledge of an asset key, object path or signed URL.

The domain keeps separate resource identity, binary delivery asset, author/contributor, academic context, visibility, moderation state, provenance and optional versions/replacements if later required.

### 1.6 Questions and answers

**Question** and **Answer** are lightweight academic/community contribution concepts.

A question can belong to academic context such as a subject, offering or broader community scope.

Authorship, visibility, moderation and deletion rules remain explicit.

### 1.7 Social graph

Academic relationships and social relationships are different concepts.

At minimum the domain distinguishes:

- **Follow** — directional interest in another user or supported followable object;
- **Connection** — reciprocal/accepted social relation if product scope uses it;
- **Shared academic context** — derived from legitimate academic relationships, not automatically a social connection;
- **Collaboration** — project/group/organization relation when supported.

The product must never reduce all relationship types to one generic “friend” relation.

### 1.8 Organization

**Organization** represents a campus/community organization such as a student center, association, club, lab, research group, alumni association, incubator, cultural/sports group or career community.

Organization is not Institution.

An Institution is part of the canonical academic catalog. An Organization is an actor/community that may be scoped to one or more academic contexts.

**OrganizationMembership / ManagementGrant** represents a person's relationship or management authority for an Organization.

Verification confirms identity/claim. It does not mean Los Apuntes endorses the organization.

### 1.9 Verification

Verification is evidence-backed state about a claim.

Examples include email ownership, academic/institutional affiliation, organization ownership/management or institution/domain claim.

Verification must never be compressed into one global boolean that implies every claim about an account is trusted.

### 1.10 Moderation and reports

**Report** is a user's explicit moderation signal about supported content/account/community objects.

**ModerationAction** is an auditable decision/action applied by authorized platform operators or automated policy processes where appropriate.

Moderation state must not destroy original domain history needed for audit, appeals or integrity unless a retention policy explicitly requires removal.

### 1.11 Saved items

A **Save/Bookmark** is a personal organizational relation.

Saving something does not transfer ownership, grant additional authorization or make private content public. A saved Resource stops resolving when the user no longer has access.

### 1.12 Opportunities and events

Opportunity/Event are planned domain areas, not required to block the study MVP.

They must later attach to explicit source/context and preserve sponsored/organic source clarity. Professional discovery must respect user opt-in.

---

## 2. Core domain invariants

### ID-01 — Stable identifiers

Display names, aliases and labels can change. Product identifiers used by links and relationships remain stable.

Renaming an institution, program, plan or subject must not break existing relationships.

### ID-02 — Account is not profile

Security/account state and user-facing profile state are conceptually separate.

Changing profile visibility or presentation cannot change authentication authority.

### ID-03 — Role is not one scalar on User

A person may simultaneously be student, alumni, mentor, organization manager, teacher/researcher or platform administrator.

Domain relationships/capabilities must not collapse those facts into one mutually exclusive `User.role`.

### ACAD-01 — Academic history is temporal

Current context changes without deleting historical affiliations, prior subjects, projects or contributions.

Graduation is a transition, not account retirement.

### ACAD-02 — Multiple affiliations are legal

The domain must not assume one person has exactly one university or one career forever.

Concurrent and historical affiliations must be representable.

### ACAD-03 — Current context is bounded and revalidated

Clients may persist a selected university/program/subject for convenience, but the backend remains authority.

A late response from an old context must not become valid merely because a client sends it.

### ACAD-04 — Catalog hierarchy is flexible

Campus, Faculty/School and Curriculum/Plan cannot be mandatory just to satisfy a universal tree.

The model must support institutions whose real structure omits those levels.

### ACAD-05 — Subject is not CourseOffering

The durable identity of a subject must not be overwritten by semester/commission/teacher-specific delivery.

### ACAD-06 — Canonical and provisional are different states

User-created missing-data proposals do not silently become canonical catalog data.

Canonicalization requires review/import/dedup logic appropriate to the source.

### ACAD-07 — Aliases are not duplicate entities

Abbreviations and historical/common names may resolve to one canonical academic entity.

Duplicate merges preserve redirects so old relationships and links keep resolving.

### ACAD-08 — Provenance survives import updates

Catalog imports keep enough source identity/version information to explain where canonical data came from and whether it is stale.

An upstream rename/inactivation must not erase product history.

### PROF-01 — Profile visibility and recommendation eligibility are distinct

A field can be hidden from public profile while still being available for a user-controlled product function, or visible while excluded from recommendation use.

The product must model these concerns separately rather than treating “public/private” as the only data-control switch.

### PROF-02 — Recruiting visibility is explicit opt-in

Academic/private study activity is not automatically employer-visible.

Professional discoverability must be intentional and reversible.

### PROF-03 — Progressive profile does not block value

Only fields required for immediate product value belong in onboarding.

Optional profile richness cannot become an authorization requirement by accident.

### SOCIAL-01 — Follow is not academic membership

Following someone does not prove shared university/program/subject context.

### SOCIAL-02 — Academic proximity is not consent to connect

Sharing a subject or program may support discovery, but it does not create a reciprocal connection.

### SOCIAL-03 — Relationship privacy is bounded

Derived labels such as “shared subject” can only expose data that the viewer is allowed to know.

The graph must not leak hidden affiliations through recommendations or mutual-context labels.

### ORG-01 — Institution and Organization are separate

A student center, lab or club cannot masquerade as the canonical university entity.

Source attribution remains visible.

### ORG-02 — Management authority is auditable

Who can publish/manage an Organization is an explicit, revocable and auditable relationship.

Verification of the organization does not grant every member management permission.

### RES-01 — File location never grants product access

Object key, file ID, storage path or signed URL is not authorization.

Every issuance/read/download operation is reauthorized from product state.

### RES-02 — Resource and binary asset are separate

Resource metadata/lifecycle cannot be inferred solely from storage existence.

An abandoned upload does not create a valid Resource.

### RES-03 — Save does not grant access

A saved Resource remains subject to its current authorization/visibility rules.

### RES-04 — Academic context is explicit

A Resource tied to a subject/offering uses stable academic identity, not only free-text labels.

The domain may later permit broader resources, but scope is still explicit.

### RES-05 — Privacy transitions are authoritative

Changing Public/Shared/Private state affects future access immediately according to server authority.

Already-issued delivery artifacts must be short-lived and cannot be treated as durable permission.

### RES-06 — Retry/finalization is idempotent where required

Mobile retry behavior must not accidentally create duplicate resources or multiple canonical finalizations for one upload intent.

### MOD-01 — Moderation is not destructive by default

Reports and moderation outcomes need an audit trail.

A hidden/removed object may require preserved administrative evidence even if normal users can no longer access it.

### AUDIT-01 — Sensitive changes are attributable

At minimum the architecture must be capable of auditing academic catalog canonicalization/merge, organization manager changes, verification changes, moderation actions and sensitive account/security actions.

### AUTH-01 — Authorization derives from server state

Client route, cached role, local storage, object URL or presentation state cannot grant permission.

### DELETE-01 — Deletion must preserve referential meaning safely

Account/resource/catalog deletion semantics must be designed explicitly.

The system cannot simply hard-delete shared domain nodes if that would corrupt academic history, moderation evidence or links.

Exactly when to anonymize, tombstone, retain or physically delete remains a DER/data-policy question.

---

## 3. Relationship expectations before physical cardinalities

These are product requirements, not SQL foreign keys.

### Person ↔ academic context

A person can have multiple AcademicAffiliations over time.

An AcademicAffiliation can reference enough canonical context to express the real membership without forcing unavailable hierarchy.

A person can have multiple SubjectParticipations with current and historical states.

### Program ↔ Curriculum ↔ Subject

A Program may have multiple curricula/plans over time.

A Subject may appear in more than one curriculum or program context.

The DER must not assume subject identity is globally unique by name.

Whether Subject is canonical at institution level, curriculum level, or represented through a reusable subject plus curriculum membership remains unresolved until the real diagram is reconciled.

### Subject ↔ CourseOffering

A Subject may have zero or many CourseOfferings.

CourseOffering is optional in the first MVP where the institution/pilot does not need commission/period-level behavior.

### Person ↔ Organization

A person can follow, participate in and/or manage Organizations through different relationships.

Management is not implied by follow or ordinary membership.

### Person ↔ Person

Follow and Connection are separate semantics.

Shared academic context is derived from academic relationships, not persisted as a substitute social edge unless later evidence requires a materialized projection.

### Resource ↔ Person

A Resource has attributable authorship/contribution.

Future rules for co-authors, ownership transfer and institutional resources remain open.

### Resource ↔ Academic context

A Resource may be attached to Subject and optionally a narrower CourseOffering/context when product behavior requires it.

A resource must not become orphaned merely because a plan is retired.

### Resource ↔ Asset

A Resource may require one or more assets over its lifecycle.

The first MVP may choose one active asset per resource, but the conceptual contract must not force storage key == resource identity.

### Question/Answer ↔ context

Question/Answer can attach to subject/community context and author.

They remain independently moderatable.

---

## 4. Lifecycle semantics

### Account lifecycle

Conceptual states include active, restricted/suspended and user-initiated closure/deletion handling.

Exact retention/anonymization policy remains open.

### Academic affiliation lifecycle

An affiliation supports temporal/history semantics rather than only `current=true`.

The domain needs enough information to distinguish current participation from past/historical identity.

Exact start/end date precision is a DER question because some sources/users may know a year/term but not an exact date.

### Curriculum/catalog lifecycle

Canonical nodes can be active, historical/inactive, merged or replaced without losing referenceability.

A merge preserves a redirect from deprecated identity to surviving canonical identity.

### Resource lifecycle

At minimum distinguish upload intent/pending, valid/available and unavailable/removed/moderated where appropriate.

Storage cleanup and product-resource state are related but not identical lifecycles.

### Organization lifecycle

An organization can exist unclaimed/unverified, claimed/verified and inactive/archived while preserving attribution/history.

---

## 5. Privacy and authorization boundaries

The domain must support decisions at these distinct layers:

1. **authentication** — who is acting;
2. **account status** — whether the principal may act;
3. **relationship/capability** — what authority the principal has;
4. **object visibility** — who may discover/read a resource/profile section;
5. **recommendation eligibility** — whether data/content can participate in personalized discovery;
6. **professional/recruiting visibility** — whether an account opts into employer-facing use;
7. **moderation eligibility** — whether an object remains distributable;
8. **delivery** — how an already-authorized file is transmitted.

A single `role`, `isPublic` or signed URL cannot replace these layers.

---

## 6. Canonical ownership and authority

### Backend authority

The backend owns authorization, canonical IDs, academic-context validation, visibility decisions, session validity, catalog canonicalization, resource finalization, organization management authority and moderation decisions.

### Client responsibility

Web/mobile may cache selected context, display data, query results and optimistic UI state.

Cached client state is never permission authority and must be fenceable when account/context changes.

### Institutional authority

An Institution or verified organization can be authoritative only for the product surfaces explicitly granted to it.

Institutional verification does not give the institution unrestricted authority over student-created content, private profiles or the entire academic graph.

---

## 7. Legacy implementation gap

The rescued API currently has one Mongo `User` shape containing `username`, `email`, `password_hash`, scalar `role` = user/admin, `full_name`, `avatar_url`, `bio`, `career_id` and `cohort_year`.

This shape is implementation history, not the 2026 domain contract.

| Legacy shape | 2026 requirement |
| --- | --- |
| credentials + profile in one User document | account/security state conceptually separated from profile presentation |
| one scalar role | multiple contextual roles/capabilities/relationships |
| one career_id | multiple simultaneous/historical academic affiliations |
| cohort_year directly on User | temporal academic membership/context |
| no canonical institution graph | stable Institution/Campus/Unit/Program/Curriculum/Subject identities |
| no SubjectParticipation | current/history of academic context |
| no organizations | campus/community organization graph + audited managers |
| no resource domain | Resource separated from binary asset/access |
| JWT embeds role | future authorization resolves authoritative server state |
| no revocable session model | #4 requires secure shared web/mobile lifecycle |

No future migration should preserve a legacy field merely because it exists today.

---

## 8. Explicitly unresolved questions

### Identity

- Does MVP require a separate Person identity from Account, or can one account own one profile while preserving future separation?
- How are email changes and multiple login methods represented?
- What deletion/anonymization policy applies to user-generated content?

### Academic graph

- What is the canonical Subject boundary: institution, program/curriculum membership, or reusable subject identity plus mapping?
- Can one CourseOffering serve multiple curricula/programs?
- What period model is required for the pilot: year, semester, trimester, term object or flexible label?
- How precise are affiliation dates?
- How are transfers, double degrees, exchanges and incomplete programs represented?
- Which academic roles need first-class semantics in MVP versus later?

### Profile

- Which section-visibility controls are MVP versus later?
- Which profile modules are structured domain objects versus presentation projections?
- Are project/skill objects shared/reusable or profile-owned records initially?

### Resources

- Is MVP one binary asset per Resource or must multiple files/pages/versions exist immediately?
- Can a Resource have co-authors?
- What ownership semantics apply when a user closes the account?
- Are external URLs first-class resource types in v1?

### Social

- Is reciprocal Connection required in MVP, or is Follow sufficient initially?
- Do blocks/mutes belong in first identity/social contract?
- Which mutual-context labels are safe to expose by default?

### Organizations

- Is ordinary membership first-class in v1 or is Follow + Manager enough initially?
- Can an organization span multiple institutions?
- What evidence is required for verified status?

### Moderation/audit

- What retention window applies to moderation evidence?
- Which events require durable audit versus ordinary application logs?

---

## 9. Persistence evidence expected from the future DER

The NotebookLM DER is an architecture reconciliation input, not a coding gate.

When it arrives, evaluate the implemented workloads against:

- relationship density and many-to-many behavior;
- referential-integrity requirements;
- uniqueness/dedup constraints;
- temporal/history queries;
- transactional boundaries;
- canonical catalog merge/update behavior;
- provisional-to-canonical transitions;
- audit requirements;
- resource finalization/idempotency;
- expected read/query patterns;
- profile extensibility needs;
- indexing/search needs;
- migration/versioning discipline;
- local/production operational complexity.

Search/indexing is not automatically the primary database. Full-text/vector search may be a separate projection later regardless of transactional persistence.

Semi-structured profile presentation does not by itself imply a document database, and relationship density does not by itself imply a relational database. The DER/workload evidence may justify replacing the current adapter, but it does not retroactively become product truth by itself.

---

## 10. Definition of domain-ready

A domain slice may be implemented before the final DER when all of these are true:

- product semantics are explicit in this contract;
- persistence-specific code is isolated behind a port/adapter;
- stable product IDs do not depend on the physical database;
- authorization, lifecycle and negative invariants are tested;
- Web/Mobile contracts do not duplicate business rules;
- the slice documents how a later DER/persistence change will be reconciled and migrated.

When the DER arrives:

- contradictions must be resolved explicitly rather than silently chosen by code or diagram;
- physical cardinalities/constraints must be mapped to the implemented semantics;
- persistence changes require a migration and rollback plan;
- accepted product invariants remain authoritative unless intentionally revised.

New modules must not harden speculative persistence assumptions, but they no longer need to wait for the DER to begin.
