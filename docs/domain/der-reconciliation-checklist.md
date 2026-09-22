# DER reconciliation checklist

Use this checklist when the real Los Apuntes DER/class diagrams become available.

The goal is not to “approve the diagram”. The goal is to determine which parts are compatible with the 2026 product, legacy but migratable, incomplete, contradictory, over-modeled for MVP or missing a required invariant.

Do not modify persistence before this reconciliation is written down.

## 1. Provenance

Record the exact file/name/version, diagram date, author/source if known, whether it is conceptual/logical/physical, technologies assumed and whether it predates the 2026 reboot.

Never treat a historical diagram as current solely because it is detailed.

## 2. Identity and account

The diagram must answer:

- Are Account/authentication and Profile distinguishable?
- Where do credentials/login providers live?
- Can sessions be revoked independently?
- Does the model incorrectly make one scalar role the user's entire authority?
- Can the same person hold contextual roles at once?
- Can account deletion/anonymization occur without destroying shared academic history?

Red flag: academic permissions inferred only from `User.role`.

## 3. Academic catalog

Check explicit representation of:

- Institution;
- optional Campus/Sede;
- optional AcademicUnit/Faculty/School;
- Program/Career;
- multiple Curriculum/Plan versions;
- Subject;
- optional CourseOffering;
- aliases;
- external source identifiers;
- provenance/version;
- lifecycle/status;
- duplicate merge/redirect semantics.

Red flag: one rigid mandatory hierarchy for every institution.

Red flag: name strings used as identity or uniqueness authority.

## 4. Person ↔ academic graph

The model must allow multiple AcademicAffiliations, simultaneous affiliations, historical affiliations, current/historical SubjectParticipation, graduation without deleting history and later alumni/mentor/teaching/research relationships.

Red flag: `user.career_id` or `isGraduated` as the complete academic model.

## 5. Program / curriculum / subject cardinality

Write down the diagram's exact cardinalities and challenge them against reality.

Questions:

- Can Program have multiple curricula?
- Can curricula coexist historically?
- Can the same subject concept appear in multiple curricula?
- Is Subject identity scoped correctly?
- Can a subject rename without breaking content?
- Is CourseOffering separated from Subject?
- Can offerings represent term/commission/modality when needed?

Do not accept a global unique subject name.

## 6. Canonical vs provisional data

The model must make it possible to distinguish canonical catalog node, alias, user/community proposal, pending review, rejected proposal and merged/deprecated identity.

Red flag: user-entered free text becoming canonical automatically.

## 7. Profile and privacy

Check whether the model can support:

- profile data independent from authentication;
- per-section visibility where used;
- professional/recruiting opt-in separately;
- recommendation eligibility separately from public visibility;
- progressive profiling without mandatory empty fields;
- historical projects/contributions without presenting them as current academic context.

Red flag: one `isPublic` boolean controlling every use of user data.

## 8. Social graph

The diagram must not collapse:

- Follow;
- reciprocal Connection;
- shared subject/program context;
- Organization membership;
- project/group collaboration.

If MVP implements fewer relations, omitted ones must remain future-compatible rather than being encoded into a misleading generic friendship edge.

## 9. Organizations

Check that Organization is distinct from Institution.

Required future capability:

- type/scope;
- institutional context;
- verification/claim state;
- followers;
- authorized managers;
- auditable manager changes;
- content attribution.

Red flag: student organizations represented as fake users or fake institutions.

## 10. Resources and files

The model must distinguish product Resource from storage Asset.

Check authorship/contributor, academic context, visibility, moderation state, upload/finalization lifecycle, save/bookmark relation, object-storage identity, optional version/replacement semantics and duplicate/idempotent finalization behavior.

Red flag: a signed URL/object key treated as authorization.

Red flag: binary upload existence automatically equals valid published Resource.

## 11. Q&A/content

If present, verify explicit author, context, visibility, moderation, timestamps/history and deletion semantics.

Academic membership must not accidentally transfer ownership.

## 12. Verification

Reject one global `verified=true` unless the claim being verified is explicit.

List verification claims needed for login/email, academic affiliation when applicable, Organization management and Institution/official source identity.

## 13. Moderation and audit

Determine whether the model can preserve report target, reporter, moderation outcome, actor, reason, timing and appeal/history if required.

List which sensitive domain changes need durable audit:

- catalog merge/canonicalization;
- organization manager grant/revoke;
- verification changes;
- account/security changes;
- moderation actions.

## 14. Temporal behavior

For every relationship ask:

- Can it start/end?
- Can it be historical but still visible in profile/history?
- Is current state derived or separately materialized?
- What happens when source catalog data becomes inactive?
- What happens when a user changes current institution/program/subject?

Avoid one mutable row/document that destroys history when context changes.

## 15. Delete/merge semantics

For each major concept record:

- hard delete allowed?
- soft delete/tombstone?
- anonymize?
- archive/inactivate?
- merge/redirect?
- who can trigger it?
- what happens to incoming relationships?

Especially verify User, Resource, Institution, Program, Curriculum, Subject and Organization.

## 16. Required uniqueness/integrity

Document business uniqueness separately from database implementation.

Examples to resolve:

- normalized account email;
- external catalog source + external ID;
- alias collisions inside context;
- duplicate academic proposal;
- duplicate Follow/Connection edges;
- one active finalization per upload intent;
- organization manager grant uniqueness;
- canonical redirect loops forbidden.

Exact constraints wait for the storage decision.

## 17. MVP pruning

Mark every diagram concept as:

- MVP required;
- MVP supporting;
- later but must remain compatible;
- historical/obsolete;
- unclear/TBD.

Do not build the entire diagram simply because it exists.

## 18. Workload inventory for persistence ADR

For each MVP flow list reads/writes/transactions.

At minimum:

- register/login/session;
- bootstrap profile + current academic context;
- find institution/program/subject;
- switch current context;
- list people/resources in subject;
- create/finalize Resource;
- authorize/read Resource;
- save Resource;
- search scoped content;
- follow/connect if MVP;
- report content;
- canonical catalog correction/merge.

For each workload capture consistency requirement, cardinality, expected fan-out, transaction boundary, history requirement, primary indexes and failure/retry behavior.

## 19. Persistence ADR decision frame

Compare candidate persistence models against the reconciled diagram on:

- referential integrity;
- relationship queries;
- transactional safety;
- schema evolution;
- semi-structured fields;
- indexing;
- dedup/canonicalization;
- temporal history;
- migration tooling;
- operational cost;
- team fluency;
- local/CI reproducibility.

Do not score a database on hypothetical scale before the pilot workload exists.

## 20. Completion output

The reconciliation is complete only when it produces:

1. annotated mapping from diagram concepts to 2026 concepts;
2. contradiction list and decisions;
3. removed/deferred concepts;
4. final MVP conceptual graph;
5. workload inventory;
6. persistence ADR;
7. migration impact on legacy Mongo User/Auth code;
8. implementation order for #4/#5/#6/#9/#10.
