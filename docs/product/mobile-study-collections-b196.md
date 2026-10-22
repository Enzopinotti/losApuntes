# Mobile study collections (B196)

The authenticated mobile profile can expose a study-collections screen when the
build is created with `EXPO_PUBLIC_STUDY_COLLECTIONS_ENABLED=true`. The flag is
false by default, matching the web discoverability flag. Enabling the mobile
flag does not enable the API: `STUDY_COLLECTIONS_ENABLED=true` remains the
server-side authority, and the mobile screen reports the API's unavailable
response without retrying or changing deployment settings.

The screen lists and pages the signed-in user's collections, creates and edits
them with operation keys and revision checks, and deletes them only after an
explicit confirmation. It can search authorized resources and add them to a
collection; collection pages preserve the server revision and use it when
removing a resource. Original resource visibility and permissions are unchanged.

The mobile client keeps collection data in memory only, scopes results to the
current authenticated session, and does not cache private collections between
sessions or devices.
