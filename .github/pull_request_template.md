## Scope

Describe one coherent change. Link the issue that owns the work.

## Verification

- [ ] Candidate was reconciled against current remote HEAD before work started.
- [ ] No secrets, runtime DB files, generated dependencies or local artifacts were added.
- [ ] `npm run check` passes from a clean install, or the PR documents the exact failing baseline.
- [ ] Security/authorization changes include negative-path tests.
- [ ] API contract changes are reflected for every affected client.
- [ ] Product behavior has explicit loading/empty/error/unauthorized states where relevant.
- [ ] Documentation/ADR updated when the change alters an architectural decision.

## Evidence

Commands, workflow run and any manual verification required.
