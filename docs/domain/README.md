# Domain documentation

This folder describes the Los Apuntes 2026 domain independently from its current physical database representation.

It separates:

1. product/domain truth;
2. application contracts/invariants;
3. persistence adapters;
4. future DER reconciliation.

A concept documented here is not automatically one table, collection, aggregate, endpoint or microservice.

## Current baseline

- [Domain Contract 2026](domain-contract-2026.md)
- [Academic Graph v1 implementation](academic-graph-implementation-v1.md)
- [DER reconciliation checklist](der-reconciliation-checklist.md)
- [Domain slices and delivery order](mvp-domain-slices.md)
- [Academic Catalog source strategy](academic-catalog-source-strategy-2026.md)
- [Files + Notes v1](files-notes-v1.md)
- [Search + contextual discovery v1](search-discovery-v1.md)
- [Social + Q&A v1](social-qa-v1.md)
- [Feeds v1](feeds-v1.md)
- [Pilot Operations v1](pilot-ops-v1.md)
- [Campus Organizations v1](campus-organizations-v1.md)
- [Alumni lifecycle v1](alumni-lifecycle-v1.md)

The implemented v1 baseline now covers Academic Graph, Profile, Files/Resources, deterministic Search/Contextual Discovery, Social/Q&A, healthy bounded Feeds/Home, Pilot Operations, Campus Organizations and Alumni lifecycle. Each slice remains behind explicit authority and replaceable persistence/storage boundaries.

The future NotebookLM DER may revise physical representation and cardinalities. It is no longer a blocker for coding modules, but it remains an architecture reconciliation input.

## Vocabulary rule

Names such as `AcademicAffiliation`, `SubjectParticipation` and `ResourceAsset` are product/domain language.

Physical persistence may use a different decomposition as long as accepted semantics and migrations are preserved.
