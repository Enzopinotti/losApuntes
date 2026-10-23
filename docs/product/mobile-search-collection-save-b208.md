# Add a Search result to a study collection (B208)

This extends B198, which already lets a signed-in user add a resource from its
details screen. Search results and current-context discovery results offer the
same action without opening the resource first.

The action is visible only for an authenticated session when
`EXPO_PUBLIC_STUDY_COLLECTIONS_ENABLED=true`. The flag remains false by default
and does not enable the server-side `STUDY_COLLECTIONS_ENABLED` authority. The
client uses the existing bounded collection picker and add endpoint; the server
continues to verify collection ownership, resource access, limits, and duplicate
handling.

Search owns one picker instance for its result surfaces. It retains only the
selected resource ID and title in screen memory, and closes the picker when the
screen loses its active session/context or the search filters change. A stale
list or add response cannot repaint a later selection. Success appears only
after the server confirms the updated collection. Adding to a study collection
does not alter the resource's Saved Library state, visibility, or permissions.

The action has an accessible resource-specific label and a 44-point target.
The picker preserves its existing empty, retry, paging, capacity, conflict, and
session-error behavior from B198.

Traceability: `MOB-FR-001`, `MOB-FR-005`, `MOB-FR-007`, `MOB-FR-009`, B196 and
B198.

Local evidence for this block is the Search collection-action wiring test, the
picker controller suite (including late response fencing between resources),
Mobile typecheck, full Mobile tests, formatting, repository hygiene, and Expo
iOS/Android exports on the exact candidate SHA. The feature remains gated off
by default; native device acceptance is a separate release check.
