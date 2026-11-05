# Solicitudes de conexión — HTTP B147

### GET /social/me/connection-requests — B147

Private authenticated inbox of **pending** connections only. Requires the existing
Auth Session; filters are applied inside MongoDB **before** paging, never after
a mixed-direction page has been loaded.

- `direction`: `incoming` (default) or `outgoing`.
- `limit`: 1..25 (default 25).
- `cursor`: optional opaque base64url continuation bound to the authenticated
  account **and** the selected direction, maximum 512 characters.
- Response: `{items: ConnectionProjection[],nextCursor: string|null}`.
- Projection reuses the existing `id,status,other,requestedByMe,incoming,
  respondedAt,createdAt,updatedAt` fields, with Profile attribution only.
  `incoming: true` means the acting account can accept or decline.
- Stable sorting: `updatedAt DESC,id ASC`; pagination is not an immutable
  snapshot if a connection changes concurrently.
- HTTP response: `Cache-Control: private, no-store`.
- Invalid, cross-owner or cross-direction cursor returns
  422 `SOCIAL_REQUEST_CURSOR_INVALID`. Bad page limit:
  422 `SOCIAL_REQUEST_LIMIT_INVALID`. Malformed repository rows are not
  projected: 503 `SOCIAL_REQUEST_DATA_INVALID`.
- No role or authorization can be inferred from a cursor: only the Auth
  principal and the stored participant/requester relationship authorize access.

### GET /social/me/connection-requests/incoming-count — B147

Private authenticated, no-store lightweight badge count:

```json
{ "pendingIncomingCount": 2 }
```

Counts pending connections where the principal is a participant **and not the
requester**. Zero is returned for an empty inbox. Datastore outages remain
errors; they never become a false zero. Counts can change after accepting,
declining or opening a session on another device; the API does not promise
push delivery or a polling cadence.

The existing `GET /social/me/connections` continues to support every status
and its previous cursor contract unchanged. No client component was modified;
the frontend team may consume these endpoints directly.


**Contrato de integración:** los endpoints están implementados en backend. El cliente debe seguir usando las acciones existentes de respuesta (accept/decline); no se modifica Web en este PR.
