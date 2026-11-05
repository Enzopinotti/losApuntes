# Study progress owner-scoped HTTP v1 — B61

**Local-only, feature-gated, production blocked until private account export covers this new data category.**

All endpoints require authenticated active user + server Boolean `STUDY_PROGRESS_ENABLED` and use `private, no-store`. Subject UUIDv4 path only; owner is always the authenticated account. No shared/public reads.

- `GET /study-progress`: owner-only, bounded `{items:[{subjectId,revision,updatedAt}]}` index sorted by ascending subject UUID, at most 16 subjects. Does not return plans, titles, notes or owner identity. Any invalid persisted metadata or over-quota database state fails closed with `STUDY_PROGRESS_INDEX_UNAVAILABLE` (503). Index entries are not resource access grants.
- `GET /study-progress/:subjectId`: latest owner snapshot `{progress:{plan,revision,updatedAt}}`, 404 if none.
- `PUT /study-progress/:subjectId`: JSON `{expectedRevision:0|N,plan:StudySessionV1}`, 200 snapshot with revision +1. Use 0 only when no record exists. Unique index prevents duplicate first-save. A per-owner transaction enforces at most 16 distinct subjects. 409 if stale or replayed; 422 when the 16-subject limit is reached.
- `DELETE /study-progress/:subjectId`: JSON `{expectedRevision:N}`, 200 `{deleted:true}`, 409 on stale revision, 404 for absent.
- 503 when server flag disabled; invalid UUID/DTO handled by Nest validation; strict plan validation rejects additional fields, invalid subject, duplicates, oversized data.
- Plan is a portable **reference-only study record**, not a permission grant. Any consumer must resolve current academic context and resource/QA access before rendering material.
- No hidden autosave, retries, merge or conflict resolution across devices. Do not overwrite if a request outcome is uncertain; GET again first.
- Private data export and production deployment are intentionally blocked until release qualifications are addressed; see `docs/product/study-progress-b61.md`.
