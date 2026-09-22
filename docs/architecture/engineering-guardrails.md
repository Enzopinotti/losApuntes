# Engineering guardrails

These rules exist before feature development so the easiest path is also the safe path.

## Repository and reproducibility

- GitHub remote is authoritative.
- Runtime/generated state is never source.
- Install from lockfiles in CI.
- A candidate is verified at its exact SHA; an older green run does not certify a newer commit.
- Main changes arrive through reviewable PRs.

## Security authority

- Backend authorization is authoritative.
- Client persistence is a convenience, never permission.
- File IDs, object keys and signed URLs never imply product authorization.
- Secrets stay outside Git; examples contain placeholders only.

## Contracts

Web and mobile consume one backend contract. Client-only endpoints or duplicated domain rules are defects.

Shared contract packages will be introduced only when there is a real contract to share; empty abstraction layers are avoided.

## Architecture

- NestJS modular monolith for the API.
- No microservices without a measured operational need.
- A worker is introduced only for real asynchronous work.
- Database choice is intentionally unresolved until DER/classes review.
- Domain names are not finalized from NotebookLM/AI suggestions alone.

## Quality gates

Every product block should add the smallest meaningful combination of:

- lint/type safety;
- unit tests for domain behavior;
- integration/contract tests for boundaries;
- negative authorization tests for sensitive paths;
- build verification;
- manual UX verification for visual/mobile behavior.

Compilation alone is not completion.

## Product correctness

Features with asynchronous or context-sensitive UI explicitly handle loading, empty, unauthorized, offline/degraded and recoverable/permanent errors where relevant.

Recommendation and feed work must preserve privacy eligibility before ranking.
