# Release evidence record

**Status:** canonical release evidence template

One release candidate should be reconstructable from one bounded record. Copy this template per candidate/deployment; do not overwrite historical evidence.

## Identity

- Release identifier:
- Environment:
- Deployment profile:
- Candidate Git SHA:
- Candidate workflow/run:
- Candidate critical jobs:
- Merge PR:
- Merged main SHA:
- Post-merge workflow/run:
- Build/image identifier or digest:
- API observable release endpoint: `/health/release`
- API observed release identifier:
- API observed source SHA:
- Web observable release manifest: `/release.json`
- Web observed release identifier:
- Web observed source SHA:
- Web embedded API origin:
- Web/API source SHA match: yes/no
- Live release qualification command/run:
- Web shell cache evidence: revalidatable / FAIL
- Web release manifest cache evidence: revalidatable / FAIL
- API release cache evidence: no-store / FAIL
- Hashed Web assets observed:
- Hashed Web asset cache evidence: immutable / FAIL
- Deployment timestamp/window:

## Planning traceability

- External key(s):
- Requirement ID(s):
- Owning issue(s), when they exist:
- GitHub carrier PR:

## Runtime and topology

- Public Web origin:
- Public API origin:
- Ingress/TLS termination:
- Trusted proxy CIDRs reference:
- Direct API bypass blocked: yes/no/evidence
- API readiness evidence:
- Runtime smoke evidence:
- Production resilience evidence file:
- Measured runtime budget reference:
- Applied resilience Compose/env reference:
- Log rotation evidence:
- Graceful-drain evidence:

## Providers

### Email

- Provider:
- Sender/domain:
- Provider verification reference:
- Delivery smoke:
- Failure/degraded-mode evidence:

### Google OAuth

- Enabled:
- Client/config reference:
- Redirect URI evidence:
- Success/cancel/collision/degraded smoke:

### Object storage

- Provider:
- Bucket:
- Region:
- Private-access evidence:
- Signed PUT/GET smoke:
- Cleanup evidence:

## Security and abuse

- Production dependency audit:
- Secret store/provider:
- Secrets source (`SECRETS_SOURCE`):
- Secrets revision (`SECRETS_REVISION`):
- Secret rotation references:
- Edge/WAF controls:
- API rate-limit controls:
- Cross-origin negative smoke:
- Sensitive-log review:

## Legal and support

- Terms version:
- Privacy version:
- Consent evidence:
- Support owner/channel:
- Incident escalation channel:

## Recovery / rollback

- Previous known-good SHA/image:
- Data/schema migration involved:
- Recovery required for this release: yes/no
- Recovery backup set id:
- Recovery point source SHA:
- Recovery point created-at / age at deployment:
- Recovery gate result:
- Off-host copy reference:
- Last isolated restore drill reference:
- Observed restore-drill RPO:
- Observed restore-drill RTO:
- Schema/data rollback compatibility:
- Rollback command/runbook:
- Runtime compatibility: n-1 / forward-only
- Current image digest:
- Accepted rollback image digest:
- Retained-image bound/evidence:
- Rollback rehearsal/evidence:
- Post-rollback smoke:

## Decision

- Status: BLOCKED / CANDIDATE / DEPLOYED / ROLLED_BACK
- Open blockers:
- External/manual gates:
- Decision owner:
- Decision timestamp:
- Notes:

## Rules

- never store passwords, tokens, provider secrets or signed URLs in this record;
- every CI/run reference must belong to the exact SHA it claims to verify;
- local smoke does not replace provider/production evidence;
- a deployment is not launch-ready while any required field is unknown or any high/critical blocker remains open;
- API release observation is valid only when `/health/release` returns `status=available` with the deployment-provided release identifier and exact 40-character source SHA; a 503/unavailable response is an explicit blocker, not evidence to replace manually;
- Web release identity is valid only when the deployed `/release.json` is `status=available`, names the exact built source SHA and the exact embedded API origin; an unavailable manifest is an explicit blocker;
- Web/Mobile qualification must reject an observed API source SHA that differs from the client artifact source SHA; an origin match alone is insufficient;
- live Web/API qualification must be run with `RELEASE_EXPECTED_SOURCE_SHA` equal to the exact candidate being qualified; `pnpm release:qualify-live` fails closed on identity or cache-policy mismatch;
- a passing Node live probe does not prove browser hot-cache rollback A -> B -> A; record that rehearsal separately with a real browser and deployed edge;
- a data-sensitive/destructive release with existing durable data requires a recent verified recovery point; only a genuinely empty first install may record recovery as N/A;
- keep the project Excel reconciled with this record rather than creating a second planning backlog here.
