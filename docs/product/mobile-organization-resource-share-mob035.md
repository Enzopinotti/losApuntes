# Share featured resources from Mobile organizations (MOB-035)

Add the shared **Share link** action next to each resource in an organization's **Featured resources** section. The row remains available only inside the organization detail snapshot currently authorized for the authenticated user's active session, focused screen, and foreground app state.

Opening the resource and sharing it are separate sibling actions. The native share message contains only the displayed title and `losapuntes:///resources/<uuid-v4>`. Opening the route loads the detail under the recipient's current session and asks the API to authorize access; the link grants no permission and contains no signed file URL or token.

This block does not change organization visibility, featured-resource selection, membership, loading, or persistence. Related traceability: MOB-FR-001, MOB-FR-005, MOB-FR-007, MOB-FR-009, and the existing organization/resource access contracts.

Local evidence includes featured-resource authority/wiring tests, resource-link payload tests, Mobile typecheck and suite, Prettier, repository hygiene, `git diff --check`, and iOS/Android Expo exports on the exact PR head. Real-device share-sheet acceptance remains separate.
