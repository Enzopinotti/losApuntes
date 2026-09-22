# Domain documentation

This folder describes the **conceptual Los Apuntes 2026 domain** before a physical persistence model is chosen.

It deliberately separates:

1. product/domain truth;
2. the rescued legacy implementation;
3. future storage representation.

A concept documented here is **not automatically a table, collection, aggregate, endpoint or microservice**.

## Current baseline

- [Domain Contract 2026](domain-contract-2026.md)
- [DER reconciliation checklist](der-reconciliation-checklist.md)
- [Domain slices and delivery order](mvp-domain-slices.md)
- [Academic Catalog source strategy](academic-catalog-source-strategy-2026.md)

The real DER/class diagrams remain an input to architecture issue #3. Until they are reconciled, these documents constrain semantics but do not choose MongoDB or PostgreSQL.

## Vocabulary rule

Names such as `AcademicAffiliation`, `SubjectParticipation` and `ResourceAsset` are working conceptual names. They exist so product, backend, web and mobile can discuss the same thing without pretending that physical entity names are final.
