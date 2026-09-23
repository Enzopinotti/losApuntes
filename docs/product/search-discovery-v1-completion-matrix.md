# Search + contextual discovery v1 — completion matrix

**Status:** implementation candidate

| Capability | API/domain | Web | Evidence |
| --- | --- | --- | --- |
| Global bounded query | Planned | Planned | Unit + build |
| Resource search authorization | Reuses Resources | Planned | Unit + runtime |
| Canonical Subject search | Reuses Academic Graph | Planned | Unit + runtime |
| Public Profile search | Planned | Planned | Privacy-negative unit |
| No private Profile leakage | Planned | Server projection only | Unit + static contract |
| Optional authenticated search | Planned | Cookie transport | Unit + static |
| Current-subject contextual discovery | Planned | Planned | Unit + runtime |
| No popularity/engagement score | Contracted | Explainable grouped UI | Docs/static |
| Dedicated critical coverage | Planned | N/A | CI |
| Container runtime smoke | Planned | API lifecycle | CI |
| Post-merge exact verification | Planned | N/A | CI |

## Closure rule

Search v1 closes only after the exact PR head and merged `main` pass the full repository verification pipeline.
