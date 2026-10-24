# Share resources from Mobile libraries (MOB-033)

Add an explicit native **Share link** action to each currently visible row in Saved Resources and My Resources. Both libraries reuse the existing safe resource-link action and the app route `losapuntes:///resources/<uuid-v4>`.

Saved Resources continues to show only the authenticated library snapshot. My Resources continues to show only resources returned for the signed-in author. The action does not change either library's load, pagination, save, edit, visibility, or access behavior. In the owned library, sharing is a sibling action to opening and managing the resource; it does not nest interactive controls.

The share message contains only the displayed title and a canonical resource UUID in the app route. It contains no signed file URL, token, session, permission grant, academic context, or user identity. Opening the route loads the resource under the recipient's current session and asks the API to authorize access. The URL is a locator, not an invitation.

Related traceability: MOB-FR-001, MOB-FR-005, MOB-FR-007, MOB-FR-009, RES-FR-005..RES-FR-010, and the existing Mobile resource-sharing contract. This feature does not claim universal/associated-domain support and does not persist additional data.

Local evidence includes the library-action wiring tests, resource-link payload tests, Mobile typecheck and suite, formatting, repository hygiene, `git diff --check`, and iOS/Android Expo exports on the exact PR head. Real-device share-sheet acceptance remains separate.
