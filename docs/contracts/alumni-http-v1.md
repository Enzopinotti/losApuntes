# Alumni lifecycle HTTP v1

## Auth

All endpoints below require the existing authenticated session.

## GET /academic/me/lifecycle

Returns the derived lifecycle projection.

Example:

```json
{
  "phase": "alumni",
  "activeStudentAffiliationIds": [],
  "alumniAffiliationIds": ["uuid"],
  "currentSubjectIds": [],
  "hasCurrentSubjectContext": false,
  "follows": [
    {
      "targetId": "uuid",
      "kind": "institution",
      "name": "Universidad ..."
    }
  ]
}
```

The response is derived from Academic Graph state and may resolve catalog redirects.

## POST /academic/me/affiliations/:id/graduate

Body:

```json
{
  "graduatedOn": "2026-09"
}
```

Rules:

- affiliation must belong to the acting user;
- withdrawn affiliation cannot graduate;
- transition is idempotent once status is `alumni`;
- current subjects inside that affiliation scope become completed;
- current context retains the affiliation but loses subject context when applicable;
- history is preserved;
- audit is durable and atomic with the state transition.

## PATCH /academic/me/affiliations/:id/roles

Body:

```json
{
  "roles": ["alumni", "mentor"]
}
```

Rules:

- role set is explicit and deduplicated;
- `roles: []` is a valid explicit empty set and is preserved;
- roles are relationship labels, not permissions/verification;
- student roles are invalid on an `alumni` affiliation;
- alumni/recent-graduate roles are invalid on applicant/withdrawn affiliations;
- the write is conditioned on the affiliation status validated before persistence, so concurrent lifecycle changes fail closed.

## Academic continuity follows

### GET /academic/me/follows

Returns canonical Institution/Program follows.

Stored follows whose targets are now missing or no longer followable are omitted from the projection. Other validation or infrastructure failures are not hidden.

### PUT /academic/me/follows/:nodeId

Creates an idempotent follow for an active canonical Institution or Program.

### DELETE /academic/me/follows/:nodeId

Removes follows across the target's redirect identity set.

Following does not change affiliation or feed eligibility by itself.

## Error codes

- `ACADEMIC_GRADUATION_TRANSITION_REQUIRED`;
- `ACADEMIC_GRADUATION_INELIGIBLE`;
- `ACADEMIC_AFFILIATION_ROLE_INVALID`;
- `ACADEMIC_AFFILIATION_CONFLICT`;
- `ACADEMIC_FOLLOW_KIND_INVALID`;
- existing `ACADEMIC_NOT_FOUND` / context errors.

## Compatibility

Existing clients that do not send affiliation roles remain valid.

Older affiliation rows without persisted roles are projected with conservative status-derived defaults.

The shared HTTP contract is mobile-safe; native Mobile presentation remains owned by #7/#49.
