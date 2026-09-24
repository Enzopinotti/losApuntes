# Release evidence record

**Status:** canonical release evidence template

One release candidate should be reconstructable from one bounded record. Copy this template per candidate/deployment; do not overwrite historical evidence.

## Identity

- Release identifier:
- Environment:
- Candidate Git SHA:
- Candidate workflow/run:
- Candidate critical jobs:
- Merge PR:
- Merged main SHA:
- Post-merge workflow/run:
- Build/image identifier or digest:
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

## Rollback

- Previous known-good SHA/image:
- Data/schema migration involved:
- Backup/snapshot reference:
- Rollback command/runbook:
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
- keep the project Excel reconciled with this record rather than creating a second planning backlog here.
