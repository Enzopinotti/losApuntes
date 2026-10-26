# Share resources from Mobile study collections (MOB-034)

Add the existing safe **Share link** action to resource rows in Mobile study-collection details. The action appears only for a resource projection returned with the current collection authority and only when its resource ID matches the collection membership ID. If access was revoked and the API omits the resource projection, the row keeps its existing unavailable message and remove action without offering a share link.

The share message contains the displayed title and `losapuntes:///resources/<uuid-v4>`. Opening the route fetches the current resource and reauthorizes it for the recipient's current session. The link is a locator, not a permission grant. Opening the resource, removing it from the collection, and sharing remain separate sibling actions. The existing persistent-collections feature flag still controls access to the screen.

No collection mutation, ordering, membership, persistence, or access contract changes. Related traceability: MOB-FR-001, MOB-FR-005, MOB-FR-007, MOB-FR-009 and the existing resource-sharing contract.

Local evidence includes collection-row wiring and safe-link payload tests, Mobile typecheck and suite, Prettier, repository hygiene, `git diff --check`, and iOS/Android Expo exports on the exact PR head. Real-device share-sheet acceptance remains separate.
