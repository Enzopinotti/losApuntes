## Planning traceability

- External key(s):
- Requirement ID(s):
- Owning issue(s), if one exists:
- [ ] The work was registered in the project planning ledger before implementation.
- [ ] This PR is one coherent carrier; it does not duplicate a separate backlog in GitHub.

## Scope

Describe one coherent change. Link the owning issue when one exists; otherwise this PR is the GitHub carrier for the registered external key. Explain any explicit non-goals.

## Verification

- [ ] Candidate was reconciled against current remote HEAD before work started.
- [ ] No secrets, runtime DB files, generated dependencies or local artifacts were added.
- [ ] `pnpm check` passes from a clean install, or the PR documents the exact failing baseline.
- [ ] Security/authorization changes include negative-path tests.
- [ ] API contract changes are reflected for every affected client.
- [ ] Product behavior has explicit loading/empty/error/unauthorized states where relevant.
- [ ] Documentation/ADR updated when the change alters an architectural decision.
- [ ] Exact-head workflow evidence belongs to this PR HEAD; an older green run is not reused.
- [ ] Review threads are answered and resolved before merge.

## Evidence

Record the exact candidate SHA, workflow run, relevant job IDs/markers and any manual verification required.

## Closure rule

Merging this PR does not by itself close the planning item. The item becomes Implemented/Validated only after the merged `main` SHA is reconciled, post-merge verification is recorded when required, documentation is promoted if applicable, and the project planning ledger is updated.

See `docs/operations/delivery-traceability.md`.
