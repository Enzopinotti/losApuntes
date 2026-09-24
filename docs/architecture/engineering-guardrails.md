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
- Feature closure follows `docs/operations/delivery-evidence-contract.md`: exact-head candidate evidence, resolved review threads, protected merge, post-merge `main` evidence and reconciled documentation.
- Notes/comments intended for future TOP task visibility are written in Spanish; canonical code identifiers and error codes are preserved as-is.

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
