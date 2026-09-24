# Engineering guardrails

These rules exist before feature development so the easiest path is also the safe path.

## Repository and reproducibility

- GitHub remote is authoritative.
- Runtime/generated state is never source.
- Node and pnpm versions are pinned.
- The repository has one workspace and one root lockfile.
- CI installs with `pnpm install --frozen-lockfile`.
- A candidate is verified at its exact SHA; an older green run does not certify a newer commit.
- Third-party GitHub Actions used by verification are pinned to immutable commit SHAs.
- Main changes arrive through reviewable PRs.

## Security authority

- Backend authorization is authoritative.
- Client persistence is a convenience, never permission.
- File IDs, object keys and signed URLs never imply product authorization.
- Secrets stay outside Git; examples contain placeholders only.
- High/critical production dependency advisories block verification.
- Removing a leaked credential from Git does not revoke it; discovered historical credentials must be rotated.

## Contracts

Web and mobile consume one backend contract. Client-only endpoints or duplicated domain rules are defects.

Shared contract packages will be introduced only when there is a real contract to share; empty abstraction layers are avoided.

## Architecture

- NestJS modular monolith for the API.
- Fastify is the accepted NestJS HTTP adapter (ADR 0001).
- No microservices without a measured operational need.
- A worker is introduced only for real asynchronous work.
- Database choice is intentionally unresolved until DER/classes review.
- Domain names are not finalized from AI suggestions alone.

## Traceability and closure

Delivery uses one traceable chain:

`requirement ID -> external planning key -> issue/PR -> exact candidate SHA/run -> merged main SHA -> post-merge evidence`.

Rules:

- the project spreadsheet is the planning ledger; GitHub must not become a second backlog with divergent status;
- every implementation carrier references stable external key(s) and requirement ID(s) when they exist;
- work is registered before implementation and reconciled after every meaningful change;
- exact-head evidence is mandatory: a green run for an older SHA never certifies a newer commit;
- review feedback is work, not commentary to ignore: valid findings become explicit tasks/evidence before merge;
- merge is not closure. Claims such as Implemented/Validated require the merged `main` SHA and post-merge evidence when the change crosses a verified boundary;
- documentation completion matrices are promoted only after the evidence they claim actually exists;
- human-readable text prepared for future TOP Tasks/comments is written in Spanish, while machine enums/IDs remain canonical.

The operational procedure is defined in `docs/operations/delivery-traceability.md`.

## Quality contract

The canonical repository command is `pnpm check`.

It must cover:

- repository hygiene;
- deterministic formatting checks;
- lint with zero warnings;
- explicit TypeScript checking;
- meaningful unit tests for domain/service behavior;
- production builds.

Production dependency audit is an additional blocking CI gate because it relies on current registry advisories.

Compilation alone is not completion.

## Product correctness

Features with asynchronous or context-sensitive UI explicitly handle loading, empty, unauthorized, offline/degraded and recoverable/permanent errors where relevant.

Recommendation and feed work must preserve privacy eligibility before ranking.
