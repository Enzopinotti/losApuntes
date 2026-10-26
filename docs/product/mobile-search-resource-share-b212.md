# Share a resource from Mobile Search (B212)

Search result rows offer an explicit native share action for a visible resource.
The message contains the displayed title and only the app route
`losapuntes:///resources/<uuid-v4>`.

The recipient must have Los Apuntes installed and open the link in the app. The
existing resource detail route fetches the resource again with the recipient's
current session, so visibility and access are checked by the server at open
time. The link is a locator, not an invitation or permission grant.

The share message never includes a signed file URL, session data, search query,
academic context, or authorization material. The app route accepts only a
canonical UUIDv4. The action runs only after a user press, uses a 44-point
accessible target, explains that access is unchanged, and reports a retryable
error if the native share sheet cannot open. Canceling the share sheet is not
reported as a failure.

This extends the existing Mobile Search deep-link contract and does not claim
universal/associated-domain support. Traceability: MOB-FR-001, MOB-FR-005,
MOB-FR-007, MOB-FR-009, SEARCH-FR-001..007, and the existing resource access
contract.

Local evidence is the payload unit suite, Search action wiring test, Mobile
typecheck and suite, formatting, repository hygiene, `git diff --check`, and
iOS/Android Expo exports on the exact candidate SHA. Real-device share-sheet
acceptance remains a separate release check.
