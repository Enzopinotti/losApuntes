# Share ranked resources from Mobile owner statistics (MOB-036)

Add **Share link** beside each resource in the current top-five saves ranking on the author's Mobile resource-statistics screen. The screen only renders a snapshot for the authenticated authority while focused and in the foreground. The ranking already contains the authorized resource ID and displayed title; sharing uses that same projection.

Opening the row and sharing remain separate sibling actions. The native share message contains only the displayed title and `losapuntes:///resources/<uuid-v4>`. The recipient's detail route reloads the resource and checks access under the current session; the URL grants no access and carries no signed file URL or token.

This does not change statistics, ranking, permissions, library contents, or persistence. Related traceability: MOB-FR-001, MOB-FR-005, MOB-FR-007, MOB-FR-009 and the existing owner-resource access contract.

Local evidence includes owner-statistics authority/wiring tests, resource-link payload tests, Mobile typecheck and suite, Prettier, repository hygiene, `git diff --check`, and iOS/Android Expo exports on the exact PR head. Real-device share-sheet acceptance remains separate.
