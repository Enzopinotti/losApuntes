# Account export artifact bucket operations

**Parent:** #183 (AUTH-FR-012)

**Policy source:** [`infra/storage/account-export-lifecycle.json`](../../infra/storage/account-export-lifecycle.json)

**Runtime access policy example:** [`infra/storage/account-export-runtime-policy.template.json`](../../infra/storage/account-export-runtime-policy.template.json)

**Security contract:** [`account-data-export-v1.md`](../security/account-data-export-v1.md)

## Required bucket boundary

Use the dedicated private account-export bucket configured by
`ACCOUNT_EXPORT_S3_BUCKET`. It must be separate from the Files bucket and use
export-scoped production credentials. The API must reach it through the
private endpoint; browser and mobile clients never receive bucket credentials,
object keys or signed URLs.

The object prefix is `exports/`. The application denies downloads exactly
seven days after `completedAt`; status checks and downloads do not extend that
window. The lifecycle configuration below is recovery cleanup for abandoned multipart
uploads and orphaned completed objects. It does not define the API's download
cutoff.

## Runtime credential scope

The API/worker identity and the operator identity are separate. The runtime
identity needs object access only for `exports/*` in the dedicated bucket. The
AWS IAM template grants exactly the adapter's current operations:

- `s3:PutObject` to write and complete single-part/multipart artifacts;
- `s3:AbortMultipartUpload` to cancel incomplete multipart writes;
- `s3:GetObject` to stream a completed artifact through the API;
- `s3:DeleteObject` to remove an expired artifact or failed staging object.

AWS maps multipart creation, part upload and completion to `s3:PutObject`, and
abort to `s3:AbortMultipartUpload`. The policy resource is an object ARN scoped
to the `exports/` prefix. [AWS multipart permissions](https://docs.aws.amazon.com/AmazonS3/latest/userguide/mpuoverview.html), [AWS object-resource scoping](https://docs.aws.amazon.com/AmazonS3/latest/userguide/security_iam_service-with-iam.html)

It grants no bucket listing, Files access, ACL changes, bucket policy changes,
or lifecycle administration. Replace
`REPLACE_WITH_ACCOUNT_EXPORT_BUCKET` with the dedicated bucket name before
using the template with AWS IAM. For another S3-compatible provider, translate
the four object operations and the `exports/*` resource into its native policy
format, then verify that the runtime identity cannot list the bucket, access
Files, or change bucket configuration. Provider API compatibility does not by
itself prove policy-language compatibility.

Attach no broader role, group, or inherited grants to the runtime identity.
Provisioning and lifecycle changes use a separate administrative identity.
Keep the bucket private with public access disabled; this runtime policy does
not configure bucket privacy. The static contract checks the example's exact
action allowlist and object prefix, but does not prove provider policy state.

## Lifecycle policy

The checked-in lifecycle JSON is a complete two-rule configuration for the
dedicated export bucket:

1. Abort incomplete multipart uploads under `exports/` after seven days from
   initiation.
2. Expire objects under `exports/` after eight days from object creation.

On Amazon S3, lifecycle expiration is queued asynchronously after the object
reaches the configured age; the age is evaluated on a UTC day boundary. The
eight-day rule is therefore an eligibility/backstop window, not an exact
physical-deletion timestamp. S3-compatible providers may differ; confirm their
documented semantics and verify the applied rule on each provider before
enabling production delivery. [AWS lifecycle timing](https://docs.aws.amazon.com/AmazonS3/latest/userguide/troubleshoot-lifecycle.html)

If the bucket already has lifecycle rules, merge these two rules with the
existing configuration before applying. `PutBucketLifecycleConfiguration`
replaces the bucket's current lifecycle configuration. [AWS CLI operation](https://docs.aws.amazon.com/cli/latest/reference/s3api/put-bucket-lifecycle-configuration.html)

## Apply and verify

Do this through the provider's approved change process, using an administrative
profile scoped to the dedicated export bucket. The administrative profile is
not the API/worker runtime identity. Supply the private endpoint and bucket
explicitly; do not put credentials in command arguments or logs.

```sh
aws --profile account-export-admin s3api put-bucket-lifecycle-configuration \
  --endpoint-url "$FILES_S3_ENDPOINT" \
  --bucket "$ACCOUNT_EXPORT_S3_BUCKET" \
  --lifecycle-configuration file://infra/storage/account-export-lifecycle.json

aws --profile account-export-admin s3api get-bucket-lifecycle-configuration \
  --endpoint-url "$FILES_S3_ENDPOINT" \
  --bucket "$ACCOUNT_EXPORT_S3_BUCKET"
```

Review the readback and confirm both enabled rule IDs, the `exports/` prefix,
`DaysAfterInitiation: 7` and `Expiration.Days: 8`. Also record the provider,
bucket, endpoint identity, change reference, readback time and operator in the
deployment evidence. A successful local contract test only validates the
checked-in policy; it is not evidence that any remote provider is configured.

## Retention limits

Lifecycle processing can be delayed. In a versioned bucket, expiring the
current version may add a delete marker while noncurrent object versions
remain; versioning and noncurrent-version expiration require a separate
retention decision. [AWS object expiration and versioning](https://docs.aws.amazon.com/AmazonS3/latest/userguide/lifecycle-expire-general-considerations.html)

The seven-day API window and eight-day lifecycle policy do not promise deletion
from version history, backups, replicas, recovery media or provider billing
records. Do not describe them as a legal retention or backup-purge guarantee.
