# Account export HTTP v1

Parent: #183
Functional requirement: AUTH-FR-012

These authenticated routes operate on the owner-scoped, versioned account
export job. They use the current active AuthSession cookie and inherit the API
`private, no-store` response policy. Every route also checks that the account
remains active through the Users authority.

## POST /account/exports

Request body: none.

The API creates a durable job or replays the caller's existing active job. It
always returns HTTP 202, including when it replays an existing request.

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

`created` is false when the response replays the active job. The job id is the
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

Returns HTTP 200 with the complete v1 JSON envelope streamed from private S3
storage through the API. The response uses:

- `Content-Type: application/json; charset=utf-8`;
- `Content-Disposition: attachment; filename="los-apuntes-account-export-v1.json"`;
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
- 410 `ACCOUNT_EXPORT_EXPIRED` at or after `downloadExpiresAt`.

Failure codes in a job status are restricted to
`ACCOUNT_EXPORT_ACCOUNT_INACTIVE`, `EXPORT_ASSEMBLY_RETRY` and
`EXPORT_RETRY_EXHAUSTED`. Arbitrary exception text and export values are never
returned in status.

The v1 artifact format and included section inventory are specified in
[`../security/account-data-export-v1.md`](../security/account-data-export-v1.md).

## Web Security integration (feature-gated)

The Web Security page includes an opt-in "Exportar mis datos" section behind
`VITE_ACCOUNT_EXPORT_WEB_ENABLED=true`. The example environment keeps this
flag `false` by default. The backend code landed under #230 as integrated but
not yet fully verified in the target environment; enabling a production UI
requires completion of the privacy/content review, provider/IAM/lifecycle
checks and exact-main qualification tracked by #183, #82 and #83.

When enabled, the Web flow:

- requests an export through authenticated cookie POST without a request body;
- retains only the current job's public status in memory, fenced by user,
  session and auth state; reloading the page simply allows replaying the
  server-side active job, never reading a durable browser job identifier;
- polls the server on a bounded 30-second cadence only while pending or
  processing and the document is visible, revalidating when focused;
- allows manual status refresh and a fresh request after failure or expired
  completion; backend CAS/deduplication remains authoritative;
- starts downloads through a regular browser attachment navigation to the
  same authenticated API, not a JavaScript `Blob`/object URL. It does not
  hold export bytes, object keys, signed URLs, credentials or session tokens;
- never assumes a timestamp shown in the browser provides authority to
  download. The backend rechecks active account, job ownership and expiry on
  the download request.

Only status records are ever shown in the Web interface. The v1 contents
remain subject to the documented domain-inclusion and privacy decisions.
This feature flag does not change or waive production launch gates.
