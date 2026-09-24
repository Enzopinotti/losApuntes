# Pilot v1 — completion matrix

**Issue:** #8  
**Status:** Implemented / Validated

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
| Exact-head candidate green | #713 / run `35927435297` on `02bcb5c9871d391b41e8d7102e91bc0bc00f46e0` |
| Post-merge main green | #714 / run `35927820127` on `77438de634c4f73bc53242dd010e2a8c542f52b9` |
| Pilot scope/support/rollback runbook | `docs/operations/pilot-v1-runbook.md` |

## Honest boundaries

The Pilot dashboard is an operational review surface, not a general analytics platform.

It does not claim production SLA monitoring, native Mobile acceptance, organization/alumni workflows, automated moderation or formal long-horizon cohort analytics.



## Closure evidence

PR #65 merged the verified Pilot v1 implementation. Candidate verify #713 / run `35927435297` completed successfully on `02bcb5c9871d391b41e8d7102e91bc0bc00f46e0`. The merged `main` SHA `77438de634c4f73bc53242dd010e2a8c542f52b9` then passed verify #714 / run `35927820127`.

This closes the implementation slice. It does not by itself certify a public pilot deployment; concrete launch inputs and production evidence remain separate operational gates.
