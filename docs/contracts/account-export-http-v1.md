# Account export HTTP — v1, v2 and v3

Parent: #183
Functional requirement: AUTH-FR-012

These authenticated routes operate on the owner-scoped, versioned account
export job. They use the current active AuthSession cookie and inherit the API
`private, no-store` response policy. Every route also checks that the account
remains active through the Users authority.

## POST /account/exports

Request body: none.

The API creates a durable job or replays the caller's existing active job. It normally returns HTTP 202, including when it replays an existing
compatible request. A version-incompatible active legacy job returns HTTP 409
(see Errors), rather than pretending to include private collections or progress.

```json
{
  "created": true,
  "export": {
    "id": "123e4567-e89b-42d3-a456-426614174000",
    "format": "los-apuntes-account-export",
    "formatVersion": 1,
    "state": "pending",
    "requestedAt": "2026-10-11T12:00:00.000Z",
    "failureCode": null,
    "downloadExpiresAt": null,
    "downloadable": false
  }
}
```

The response example shows the historical `formatVersion: 1`. If persistent
Study Collections are enabled **or existing private collections belong to
the owner**, the new job uses `formatVersion: 2` and includes the additional
`study.collections` section. If study progress exists for the owner (or its local-only feature is enabled), the new job uses **v3** with 32 sections, including `study.progress` and `study.collections`. Both owner-only existence checks remain effective after their respective feature flags have been disabled. Missing readers or Mongo failures abort the request rather than silently downgrading the format.

`created` is false when the response replays a compatible active job. The job id is the
only identifier the client needs for status and download requests.

## GET /account/exports/{exportId}

Returns HTTP 200 with the same `export` status projection as the request
response. Stable states are `pending`, `processing`, `completed` and `failed`.
`downloadExpiresAt` is an ISO timestamp only when completion metadata has an
expiry; otherwise it is null. `downloadable` is false at or after expiry.
Status checks do not extend the artifact lifetime.

```json
{
  "id": "123e4567-e89b-42d3-a456-426614174000",
  "format": "los-apuntes-account-export",
  "formatVersion": 1,
  "state": "completed",
  "requestedAt": "2026-10-11T12:00:00.000Z",
  "failureCode": null,
  "downloadExpiresAt": "2026-10-18T12:04:12.000Z",
  "downloadable": true
}
```

The response never includes attempt/claim ids, storage provider, bucket, object
key, signed URL, byte count, digest, or export content.

## GET /account/exports/{exportId}/download

Returns HTTP 200 with the complete version-matched JSON envelope streamed
from private S3 storage through the API. Historical jobs retain v1 with
30 sections; v2 jobs use 31, including `study.collections`; v3 jobs use 32, adding `study.progress`. The response uses:

- `Content-Type: application/json; charset=utf-8`;
- `Content-Disposition: attachment; filename="los-apuntes-account-export-v1.json"` for v1, `...-v2.json` for v2, or `...-v3.json` for v3;
- `Cache-Control: private, no-store`;
- `X-Content-Type-Options: nosniff`;
- `Content-Length` matching the committed UTF-8 artifact size.

The server rechecks the active account and job owner before each download. It
does not redirect to storage or issue a signed URL. Download requests do not
extend the seven-day artifact window.

## Errors

- 400 for an invalid UUID route parameter.
- 401 `AUTHENTICATION_REQUIRED` when the current AuthSession is absent or
  invalid.
- 403 `ACCOUNT_RESTRICTED` from the AuthSession guard or
  `ACCOUNT_EXPORT_ACCOUNT_INACTIVE` if the account becomes inactive before the
  service operation.
- 404 for a missing or foreign job id; these cases are indistinguishable.
- 409 `ACCOUNT_EXPORT_NOT_READY` when the job is not completed.
- 409 `ACCOUNT_EXPORT_LEGACY_JOB_ACTIVE` when a newer format is required but a previous active job still uses a lower version. Retry after it finishes.
- 410 `ACCOUNT_EXPORT_EXPIRED` at or after `downloadExpiresAt`.

Failure codes in a job status are restricted to
`ACCOUNT_EXPORT_ACCOUNT_INACTIVE`, `EXPORT_ASSEMBLY_RETRY` and
`EXPORT_RETRY_EXHAUSTED`. Arbitrary exception text and export values are never
returned in status.

The immutable historical v1 format and its 30-section inventory are
specified in [account-data-export-v1](../security/account-data-export-v1.md).
The 31-section v2 contract and owner-only private projection are specified
in [account-data-export-v2-study-collections](../security/account-data-export-v2-study-collections.md).
The 32-section v3 contract and owner-only study progress projection are specified in [account-data-export-v3-study-progress](../security/account-data-export-v3-study-progress.md).
Neither an export request nor a download grants new access to resources
referenced by collections or study plans.

## Web Security integration (feature-gated)

The Web Security page includes an opt-in Exportar mis datos section behind the VITE_ACCOUNT_EXPORT_WEB_ENABLED=true flag. The example environment keeps this flag false by default. Production enablement still depends on the privacy/content review, provider/IAM/lifecycle checks and exact-main qualification tracked by #183, #82 and #83.

When enabled, the Web flow:

- requests an export through authenticated cookie POST without a request body;
- retains only the current job public status in memory, fenced by user, session and auth state; reloading the page replays the server-side active job without a durable browser job identifier;
- polls on a bounded 30-second cadence only while pending or processing and the document is visible, then revalidates when focused;
- allows manual status refresh and a fresh request after failure or expiry, while backend CAS/deduplication remains authoritative;
- starts downloads through ordinary browser attachment navigation to the same authenticated API, without a JavaScript Blob, object URL or signed storage URL;
- relies on the backend to recheck account state, job ownership and expiry for every download.

Only status records are shown in the Web interface. The versioned export contents remain subject to the documented domain-inclusion and privacy decisions. This feature flag does not waive production launch gates.
