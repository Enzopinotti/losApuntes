# Social + Q&A v1 — completion matrix

| Capability | Required | Evidence before close |
| --- | --- | --- |
| Directional Follow | yes | unit + runtime |
| Follow idempotency, including concurrent duplicate requests | yes | persistence + runtime concurrency |
| Follow != Connection | yes | negative unit + runtime |
| Connection request | yes | unit + runtime |
| Recipient-only accept/decline | yes | negative unit + runtime |
| Unique unordered connection pair + single request notification under concurrency | yes | persistence + runtime concurrency |
| Disconnect/re-request lifecycle | yes | unit + runtime |
| Shared academic context does not auto-connect | yes | runtime |
| Public Question read + invalid presented auth fails closed | yes | runtime |
| Canonical Subject/CourseOffering | yes | Academic integration test |
| Question author edit/close | yes | unit + runtime |
| Closed Question rejects new Answer | yes | negative unit + runtime |
| Answer author edit | yes | unit |
| Accepted Answer ownership/membership | yes | negative unit + runtime |
| Hidden Question/Answer fail closed | yes | runtime |
| Pending reports | yes | runtime |
| Report idempotency | yes | runtime |
| Essential notification creation + navigable accepted-answer target | yes | transaction + unit + runtime |
| Notification ownership/read state | yes | negative unit + runtime |
| Privacy-safe Profile attribution | yes | unit + runtime |
| Bounded cursor pagination for relationships/questions/notifications | yes | unit + Web contract + runtime |
| Web network surface | yes | build + static contract |
| Web Q&A surface | yes | build + static contract |
| Dedicated critical coverage gate | yes | CI |
| Container lifecycle smoke | yes | CI |
| Exact-head candidate green | yes | recorded in PR |
| Post-merge main green | yes | recorded before closure |

## Honest boundaries

This matrix does not claim Feed ranking, push/email notification delivery, block/mute semantics, direct messaging or moderation resolution/admin tooling.

Those remain independent slices and must not be inferred from Social + Q&A v1.
