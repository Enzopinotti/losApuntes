# Production secrets and rotation

**Status:** operational contract — provider-specific secret stores remain deployment inputs

No production secret belongs in Git, a Docker image, a client bundle or a release document.

## Secret classes

Current server-side sensitive configuration includes:

- Mongo connection credentials when the production URI contains credentials;
- SMTP credentials;
- Google OAuth Web client secret;
- S3-compatible access key and secret key;
- infrastructure/provider credentials used outside the application process.

Public identifiers such as OAuth client IDs, bucket names, regions and origins are configuration but are not secrets by themselves.

## Injection contract

Production secrets must be injected at runtime by the deployment platform or a dedicated secret manager.

The repository stores only variable names/placeholders.

The application:

- fails startup when required configuration is absent;
- never logs secret values intentionally;
- redacts common secret/token/password fields in structured logs;
- rejects the known local RustFS credentials when `NODE_ENV=production`;
- never sends server secrets to Web/Mobile clients.

## Rotation procedure

For each secret:

1. identify consumers and owner;
2. create the replacement in the provider/secret manager;
3. deploy the replacement without committing it;
4. verify readiness and the affected provider path;
5. revoke the previous credential;
6. verify again after revocation;
7. record only secret name/version/reference, timestamps and evidence IDs — never the value.

When a provider supports overlap, prefer create → deploy → verify → revoke.

For compromise, revoke first when necessary and accept temporary provider degradation rather than knowingly retaining a compromised credential.

## Required release evidence

Record:

- secret store/provider used;
- secret reference/version for each required class;
- last rotation date;
- owner;
- whether rotation was tested;
- any pending provider limitation.

Never paste secret values into the release evidence package, GitHub issue, PR, spreadsheet comment or support ticket.

## Local credentials

The local Compose environment intentionally uses fixed RustFS credentials for isolated developer/CI runtime only.

The runtime rejects these known values in production. This is a guardrail against accidental promotion, not a substitute for a real secret manager or rotation policy.
