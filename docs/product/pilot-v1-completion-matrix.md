# Pilot v1 — completion matrix

**Issue:** #8  
**Status:** In implementation

| Capability | Required evidence |
| --- | --- |
| Contextual authenticated Home | API + Web + runtime |
| Home reuses existing Feed authority | architecture + unit |
| Anonymous landing remains available | Web contract |
| Follow / Connection | already closed in Social v1 |
| Lightweight Q&A | already closed in Social/Q&A v1 |
| Essential notifications | already closed in Social/Q&A v1 |
| Unified report queue | unit + runtime |
| Resource moderation resolution | transaction + negative unit + runtime |
| Question moderation resolution | transaction + negative unit + runtime |
| Answer moderation resolution | transaction + negative unit + runtime |
| Moderation audit trail | persistence + runtime |
| Concurrent review fails closed | adapter/unit + runtime |
| Pilot read permission | negative unit + runtime |
| Moderation write permission | negative unit + runtime |
| Admin Web surface | build + static contract |
| Onboarding drop-off metrics | unit + runtime |
| Search no-result metrics | unit + runtime |
| Contribution rate | unit + runtime |
| Returning-use rate | unit + runtime |
| Active Subject density | unit + runtime |
| Moderation backlog/status | unit + runtime |
| No search/content text in telemetry | schema/static contract |
| Server-side allowlisted telemetry | unit |
| Dedicated Pilot coverage gate | CI |
| Container lifecycle smoke | CI |
| Exact-head candidate green | PR evidence |
| Post-merge main green | closure evidence |
| Pilot scope/support/rollback runbook | documentation |

## Honest boundaries

The Pilot dashboard is an operational review surface, not a general analytics platform.

It does not claim production SLA monitoring, native Mobile acceptance, organization/alumni workflows, automated moderation or formal long-horizon cohort analytics.

