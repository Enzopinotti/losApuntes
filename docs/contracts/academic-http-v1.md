# Academic HTTP contract v1

Base path: `/academic`

## Authentication model

Catalog reads are public.

User academic state and proposals require the same revocable AuthSession authority as Identity/Auth v1.

Canonical catalog writes additionally require platform permission:

`academic:catalog:write`

Web uses the existing HttpOnly cookie transport. Native/mobile uses the existing Bearer transport. The Academic module does not define a second authentication mechanism.

## Public catalog

### GET /academic/catalog/search

Query:

- `kind` optional;
- `q` optional, 2–120 chars;
- `parentId` optional UUID;
- `limit` optional, 1–50, default 25;
- `cursor` optional opaque cursor.

Response:

```json
{
  "items": [
    {
      "id": "uuid",
      "kind": "institution",
      "name": "Universidad ...",
      "aliases": ["..."],
      "parentIds": ["uuid"],
      "status": "active",
      "provenance": {
        "authorityTier": "A",
        "sourceKey": "source",
        "sourceUrl": "https://..."
      },
      "revision": 1,
      "createdAt": "ISO-8601",
      "updatedAt": "ISO-8601"
    }
  ],
  "nextCursor": null
}
```

Search only returns active canonical nodes.

The cursor is opaque to clients and must be replayed unchanged.

### GET /academic/catalog/:id

Returns the canonical node.

If `:id` is a merged legacy/duplicate ID, the backend resolves it and returns:

```json
{
  "node": { "...": "canonical target" },
  "resolvedFromId": "original-merged-id"
}
```

### GET /academic/catalog/:id/children

Returns active children of the resolved canonical parent.

Optional `kind` narrows the child type.

The result is bounded.

## User affiliations

All endpoints below require AuthSession.

### GET /academic/me/affiliations

Lists affiliations owned by the current user.

### POST /academic/me/affiliations

Body:

```json
{
  "institutionId": "uuid",
  "campusId": "uuid optional",
  "academicUnitId": "uuid optional",
  "programId": "uuid optional",
  "curriculumId": "uuid optional",
  "status": "active",
  "startedOn": "2026",
  "endedOn": "2027-12"
}
```

`startedOn`/`endedOn` accept `YYYY` or `YYYY-MM`.

The backend rejects cross-institution combinations.

### PATCH /academic/me/affiliations/:id/status

Body:

```json
{
  "status": "completed",
  "endedOn": "2029"
}
```

The target must belong to the authenticated user.

## Subject participation

### GET /academic/me/subjects

Lists current/historical SubjectParticipation records for the current user.

### PUT /academic/me/subjects/:subjectId

Upserts the semantic participation key.

Body:

```json
{
  "courseOfferingId": "uuid optional",
  "state": "current",
  "periodLabel": "2026 S2"
}
```

If `courseOfferingId` exists, it must belong to `:subjectId`.

## Current context

### GET /academic/me/context

Returns:

```json
{
  "context": null
}
```

or:

```json
{
  "context": {
    "affiliationId": "uuid",
    "subjectParticipationId": "uuid optional",
    "updatedAt": "ISO-8601"
  }
}
```

### PUT /academic/me/context

Body:

```json
{
  "affiliationId": "uuid",
  "subjectParticipationId": "uuid optional"
}
```

Ownership and graph consistency are revalidated server-side.

## Missing-data proposal

### POST /academic/proposals

Body:

```json
{
  "kind": "subject",
  "proposedName": "Materia faltante",
  "parentIds": ["uuid"],
  "evidenceUrl": "https://...",
  "notes": "optional"
}
```

Response state is always initially `pending`.

Submission is not canonicalization.

## Catalog administration

All endpoints below require AuthSession + `academic:catalog:write`.

### POST /academic/admin/catalog

Creates one canonical node.

Required:

- `kind`;
- `name`;
- `provenance`.

Optional:

- `aliases`;
- `parentIds`;
- source external identity metadata.

### PATCH /academic/admin/catalog/:id

Requires `expectedRevision`.

Supports bounded changes to:

- name;
- aliases;
- parent IDs;
- active/inactive state;
- provenance.

Merged nodes are immutable.

### POST /academic/admin/catalog/:id/merge

Body:

```json
{
  "targetId": "uuid",
  "expectedRevision": 3
}
```

Only same-kind nodes may be merged.

The source ID remains resolvable through redirect.

## Error codes

Relevant stable codes include:

- `AUTHENTICATION_REQUIRED`;
- `ACCOUNT_RESTRICTED`;
- `ACADEMIC_CATALOG_WRITE_FORBIDDEN`;
- `ACADEMIC_NOT_FOUND`;
- `ACADEMIC_CURSOR_INVALID`;
- `ACADEMIC_SOURCE_IDENTITY_EXISTS`;
- `ACADEMIC_NODE_MERGED`;
- `ACADEMIC_REVISION_CONFLICT`;
- `ACADEMIC_MERGE_SELF`;
- `ACADEMIC_MERGE_KIND_MISMATCH`;
- `ACADEMIC_REDIRECT_LOOP`;
- `ACADEMIC_REDIRECT_INVALID`;
- `ACADEMIC_REDIRECT_TOO_DEEP`;
- `ACADEMIC_NODE_KIND_INVALID`;
- `ACADEMIC_PARENT_INVALID`;
- `ACADEMIC_PARENT_CARDINALITY_INVALID`;
- `ACADEMIC_CONTEXT_MISMATCH`;
- `ACADEMIC_CONTEXT_INELIGIBLE`.

HTTP validation uses the repository-wide error envelope and request ID.

## Client rules

Clients must not:

- infer authorization from catalog names;
- persist Mongoose IDs;
- construct or decode cursors;
- treat proposal IDs as canonical IDs;
- assume every hierarchy level exists;
- assume one affiliation per user;
- assume Subject == CourseOffering;
- silently create catalog entries when lookup fails.

Web and Mobile should consume these same semantics.
