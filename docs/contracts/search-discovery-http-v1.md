# Search + contextual discovery HTTP v1

## GET /search

Authentication: optional.

Query:

- `q` — required, 2–120 chars;
- `scope` — optional, `all | resources | subjects | people`, default `all`;
- `limit` — optional integer 1–20, default 8;
- `subjectId` — optional UUID, applies only to Resource results.

Response:

```json
{
  "query": "base de datos",
  "scope": "all",
  "results": {
    "resources": [],
    "subjects": [],
    "people": []
  }
}
```

Scopes omitted by the request are returned as empty arrays. This keeps the response stable without implying that unqueried authorities returned no matches.

### Resource item

Uses the current Resource public projection and therefore inherits Resource authorization.

### Subject item

```json
{
  "id": "uuid",
  "name": "Base de Datos",
  "aliases": ["Bases de Datos"],
  "kind": "subject"
}
```

### People item

```json
{
  "profileId": "uuid",
  "displayName": "Nombre público",
  "avatarUrl": null
}
```

No account id/email or private Profile field is returned.

## GET /discovery/contextual

Authentication: required.

Query:

- `subjectLimit` — optional integer 1–8, default 6;
- `resourcesPerSubject` — optional integer 1–8, default 4.

Response:

```json
{
  "subjects": [
    {
      "subject": {
        "id": "uuid",
        "name": "Base de Datos"
      },
      "resources": []
    }
  ]
}
```

Only current SubjectParticipation rows participate.

No result means no current context was available; the API does not synthesize recommendations.

## Errors

Validation uses the repository-wide error envelope and request id.

Search does not create new authorization error semantics. Resource/Profile/Academic authorities keep their own error contracts.
