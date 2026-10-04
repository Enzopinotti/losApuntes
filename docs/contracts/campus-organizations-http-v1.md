# Campus Organizations HTTP v1

## Public

### GET /organizations

Query:

- `q` optional;
- `type` optional;
- `institutionId` optional UUID;
- `programId` optional UUID;
- `limit` 1–50;
- `cursor` optional.

Returns bounded public organization cards.

### GET /organizations/:id

Anonymous-readable.

Returns:

- identity/type;
- verification state;
- academic scope;
- about/avatar/cover if present;
- useful links;
- currently public featured Resources;
- recent posts;
- upcoming/recent events;
- follower count;
- `viewer.following` only when a valid session is presented;
- `viewer.managementRole` only for the authenticated viewer.

No manager user IDs are exposed publicly.

### GET /organizations/:id/posts

Bounded public posts with explicit organization source.

### GET /organizations/:id/events

Bounded organization events.

## Authenticated viewer

### PUT /organizations/:id/follow

Idempotent.

### DELETE /organizations/:id/follow

Idempotent.

Following is explicit and independent of academic affiliation.

## Creation

### POST /organizations

Requires active authenticated session + verified email.

Body includes:

- name;
- type;
- institutionId;
- optional campusId / academicUnitId / programId;
- optional about;
- optional website.

Creator becomes `owner`.

New pages start:

- `claimState = claimed`;
- `verificationState = unverified`;
- `status = active`.

Creation does not auto-verify.

## Manager operations

All manager writes require active verified session and current Organization role.

### PATCH /organizations/:id

Owner/admin only.

Uses `expectedRevision`.

### POST /organizations/:id/archive

Owner only; requires an active authenticated session and verified email.

Body:

```json
{
  "expectedRevision": 3,
  "expectedManagementRevision": 7,
  "reason": "Cierre de la organización"
}
```

The reason is bounded to 3–500 characters and must remain meaningful after
server normalization. The current organization and management revisions are
both required; stale values fail with their corresponding revision-conflict
code.

The successful response is:

```json
{
  "organization": {
    "id": "uuid",
    "status": "archived",
    "revision": 4,
    "managementRevision": 8
  },
  "archived": true
}
```

The owner check, status/revision transition, revocation of every operational
manager grant and `organization.archived` audit event commit in one transaction.
Posts, events, links, follows, featured Resource references and shared history
are preserved; active-only public surfaces stop exposing the archived
Organization. Archiving is not deletion or a purge operation.

### POST /organizations/:id/posts

Owner/admin/editor.

### PATCH /organizations/:id/posts/:postId

Owner/admin/editor.

### DELETE /organizations/:id/posts/:postId

Owner/admin/editor.

### POST /organizations/:id/events

Owner/admin/editor.

### PATCH /organizations/:id/events/:eventId

Owner/admin/editor.

### POST /organizations/:id/links

Owner/admin/editor.

### DELETE /organizations/:id/links/:linkId

Owner/admin/editor.

### PUT /organizations/:id/resources/:resourceId

Owner/admin/editor.

### DELETE /organizations/:id/resources/:resourceId

Owner/admin/editor.

### PUT /organizations/:id/managers/:profileId

Owner/admin with role constraints.

Body:

```json
{
  "role": "editor",
  "reason": "Responsable de comunicación",
  "expectedManagementRevision": 4
}
```

Rules:

- admin cannot grant owner;
- admin cannot mutate an owner;
- role changes are auditable;
- caller may not eliminate the final owner.

### DELETE /organizations/:id/managers/:profileId

Same revision/audit/final-owner constraints.

## Platform verification

### PATCH /organizations/:id/verification

Requires:

- AuthSession;
- platform permission `organizations:verify`.

Body:

```json
{
  "verificationState": "verified",
  "reason": "Evidence reviewed",
  "expectedRevision": 2
}
```

This permission does not grant manager rights.

## Error contract

Stable codes include:

- `ORGANIZATION_NOT_FOUND`;
- `ORGANIZATION_SCOPE_INVALID`;
- `ORGANIZATION_MANAGEMENT_FORBIDDEN`;
- `ORGANIZATION_MANAGER_ROLE_FORBIDDEN`;
- `ORGANIZATION_FINAL_OWNER_REQUIRED`;
- `ORGANIZATION_REVISION_CONFLICT`;
- `ORGANIZATION_MANAGEMENT_REVISION_CONFLICT`;
- `ORGANIZATION_ARCHIVE_REASON_INVALID`;
- `ORGANIZATION_VERIFICATION_FORBIDDEN`;
- `ORGANIZATION_EVENT_PERIOD_INVALID`;
- `ORGANIZATION_LINK_INVALID`;
- `ORGANIZATION_RESOURCE_NOT_PUBLIC`.

Cross-user management probes use not-found/forbidden semantics without leaking unnecessary internal IDs.
