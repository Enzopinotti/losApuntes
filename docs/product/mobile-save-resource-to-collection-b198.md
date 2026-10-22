# Save a resource to a study collection from its details (B198)

Authenticated resource details now offer a direct action to add the displayed
resource to one of the user's persistent study collections. The action is
available only when the mobile build flag
`EXPO_PUBLIC_STUDY_COLLECTIONS_ENABLED=true` is set; it does not enable the API
or change server configuration.

The picker loads one bounded page at a time, supports pagination, and confirms
the server-returned collection count after a successful save. It keeps the
selection in memory only, scopes requests to the active authenticated session,
and cancels or fences late responses when the user closes the picker, leaves the
screen, or changes session. The server remains responsible for collection
ownership, resource authorization, limits, and duplicate handling.

No resource visibility, sharing, or access permissions change. The existing
persistent-collections build flag remains false by default.
