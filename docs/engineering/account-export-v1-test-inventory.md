# Account Export v1 — fixture and contract regression

The v1 portable account export envelope contains **exactly 30 sections** under `sections`, ordered by `ACCOUNT_EXPORT_V1_SECTION_IDS`. Empty sections are represented by empty arrays; a missing contributor must **never** result in a superficially successful partial export. Version 2 adds `study.collections` separately and must not change existing v1 artifacts.

## Regressions addressed

Existing assembler unit fixtures registered one or two contributors and expected a one- or two-section artifact. After the fixed inventory was enforced in production, these fixtures failed before exercising streaming, cancellation, backpressure and output durability. The revised fixture helper injects **empty contributors for the other v1 section IDs only inside the tests**. No production registry fallback or export format relaxation is permitted.

Behavioral coverage continues to assert:

- all 30 v1 keys exist, with test-specified records only where applicable
- SHA-256 and UTF-8 byte length cover the **entire** serialized output
- 10,000 records are streamed in bounded pages of 100 without buffering the whole artifact
- inactive account, revoked worker claim, bad cursor, unserializable record and sink failure paths abort or fail closed as before
- an intentionally incomplete *real* registry is rejected before producing output
- the controller refuses an invalid persisted artifact version before opening owner-private storage; invalid version 99 is test-only and deliberately cast at the trust boundary

## Verification

Targeted Jest: `pnpm --filter @losapuntes/api exec jest --runInBand --runTestsByPath src/data-lifecycle/domain/account-export-assembler.spec.ts src/data-lifecycle/account-export.controller.spec.ts`.

Full critical coverage gates must be checked on the exact PR head. Passing these tests does not authorize bypassing the global formatting, TypeScript, runtime smoke or production dependency audit gates. No database or application process is required for these unit tests.
