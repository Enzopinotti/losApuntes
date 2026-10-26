# Share resource links from the Mobile Home feed (MOB-037)

Add the existing **Share link** action to resource items displayed in the Home academic, community, and For You feeds. Questions and organization items keep their current actions. The feed row exists only in the current Home snapshot authorized for the active session and context.

Opening a feed resource and sharing it remain separate sibling actions. The native share message contains only the displayed title and `losapuntes:///resources/<uuid-v4>`. Opening the app route loads the resource again and rechecks the recipient's current access. The link contains no signed file URL or authorization grant.

This block does not change feed ranking, pagination, visibility, persistence, or context selection. Related traceability: MOB-FR-001, MOB-FR-005, MOB-FR-007, MOB-FR-009 and the existing resource access contract.

Local evidence includes Home feed authority/wiring tests, resource-link payload tests, Mobile typecheck and suite, Prettier, repository hygiene, `git diff --check`, and iOS/Android Expo exports on the exact PR head. Real-device share-sheet acceptance remains separate.
