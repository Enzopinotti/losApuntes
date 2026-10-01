# Production recovery — Mongo + Files

**Canonical issue:** #100  
**Related gates:** #48, #83, #87  
**Status:** repository recovery contract; real production/off-host evidence is external.

Los Apuntes stores related durable truth in two systems:

- MongoDB: Resource and FileAsset metadata/relationships;
- private object storage: the bytes referenced by FileAsset.

A valid recovery point is therefore a **backup set**, never a Mongo dump by itself.

## 1. Backup-set contract

A backup set contains:

- `mongo.archive.gz`;
- `files/` — object-storage mirror;
- `files.inventory.jsonl` — sorted key/size/SHA-256 inventory;
- `manifest.json` — bounded non-secret metadata tying both parts together.

The manifest records:

- backup set id;
- creation timestamp;
- exact source release SHA;
- explicit schema/data version;
- source environment label;
- consistency mode;
- Mongo archive size + SHA-256;
- Files object count + total bytes + inventory SHA-256;
- tool versions.

It deliberately does **not** record Mongo DSNs, passwords, storage credentials or signed URLs.

The backup directory must be an absolute path outside the Git repository. A symlink-resolved path is checked again before any artifact is created.

## 2. Consistency requirement

The current v1 strategy is **application quiescence**.

The script does not pretend it can create a distributed transaction across Mongo and S3-compatible storage. Before running it, the operator must stop/disable product writes for the backup window and only then set:

```bash
BACKUP_QUIESCED=true
```

Without that value the backup command fails closed.

For an external Beta/production environment, use a maintenance/drain procedure that prevents new writes while allowing the backup to finish. Record the observed backup window in release evidence.

## 3. Creating a backup set

Required inputs are provided through the environment; secrets are never command-line arguments.

Example shape:

```bash
export RELEASE_SHA="<exact 40-character deployed SHA>"
export BACKUP_SOURCE_ENV="production"
export BACKUP_SCHEMA_VERSION="mongo-v1"
export BACKUP_ROOT="/srv/losapuntes-recovery"
export BACKUP_QUIESCED="true"

export BACKUP_MONGO_URI="<from secret manager>"
export BACKUP_FILES_ENDPOINT="https://storage.example.invalid"
export BACKUP_FILES_BUCKET="losapuntes-files"

# AWS_ACCESS_KEY_ID / AWS_SECRET_ACCESS_KEY or another AWS CLI credential
# source is supplied by the deployment secret mechanism.

pnpm recovery:backup
```

The Mongo URI is written only to a temporary mode-0600 Mongo Database Tools config and supplied through `--config`, rather than being placed in process arguments.

The operation:

1. acquires a per-set lock;
2. creates a `.<set>.partial` directory;
3. produces a compressed Mongo archive;
4. mirrors the private bucket;
5. hashes Mongo + every mirrored object;
6. writes the manifest;
7. verifies the complete set;
8. atomically renames the partial directory to its final set id.

If the exact set id already exists and verifies with the same release/schema/environment metadata, the command is idempotent and reports it as reused.

## 4. Recovery-point release gate

Before a migration/backfill/destructive data change on an environment with durable user data:

```bash
export RECOVERY_SET_DIR="/srv/losapuntes-recovery/<set-id>"
export RECOVERY_EXPECTED_SOURCE_SHA="<currently deployed pre-change SHA>"
export RECOVERY_MAX_AGE_HOURS="24"

pnpm recovery:check
```

The gate re-hashes the entire backup set, requires the expected source SHA and rejects evidence older than the accepted window.

Only a genuinely empty first installation may use N/A:

```bash
export RECOVERY_FIRST_INSTALL_EMPTY=true
export RECOVERY_FIRST_INSTALL_ACK=EMPTY_DATABASE_AND_EMPTY_FILES_CONFIRMED
pnpm recovery:check
```

Do not use the first-install escape for an environment that has ever accepted durable user data.

## 5. Restore drill

Restore is intentionally destructive to its **target** and therefore has several independent guards.

Required target declarations:

```bash
export BACKUP_SET_DIR="/srv/losapuntes-recovery/<set-id>"
export RESTORE_TARGET_ENV="restore-drill"
export RESTORE_NONPRODUCTION_ACK=I_HAVE_VERIFIED_THIS_TARGET_IS_NON_PRODUCTION
export RESTORE_CONFIRM="RESTORE:<set-id>"
export RESTORE_ALLOW_DELETE=true

export RESTORE_MONGO_URI="<isolated restore Mongo URI>"
export RESTORE_FILES_ENDPOINT="https://restore-storage.example.invalid"
export RESTORE_FILES_BUCKET="losapuntes-restore"
export RECOVERY_EVIDENCE_ROOT="/srv/losapuntes-recovery-evidence"

pnpm recovery:restore
```

The script refuses common production labels. The explicit non-production ACK is still required because no program can infer deployment ownership safely from a hostname alone.

Restore performs:

- complete backup-set checksum verification before mutation;
- `mongorestore --drop --stopOnError`;
- Files mirror restore with target-side deletion of objects absent from the backup;
- per-object restored size verification;
- a second dry-run sync that must converge to no remaining changes;
- a non-secret PASS evidence record outside the repository.

## 6. Application-level verification

After the restored API dependencies are available, build the API and run:

```bash
export RESTORE_VERIFY_TARGET_ENV="restore-drill"
export RESTORE_VERIFY_MONGO_URI="<isolated restore Mongo URI>"
export RESTORE_VERIFY_FILES_ENDPOINT="https://restore-storage.example.invalid"
export RESTORE_VERIFY_FILES_REGION="us-east-1"
export RESTORE_VERIFY_FILES_BUCKET="losapuntes-restore"
export RESTORE_VERIFY_FILES_ACCESS_KEY_ID="<secret>"
export RESTORE_VERIFY_FILES_SECRET_ACCESS_KEY="<secret>"

pnpm --filter @losapuntes/api recovery:verify
```

This verifier walks restored Resources and fails closed unless every Resource has:

- its referenced FileAsset;
- FileAsset state `ready`;
- durable safety-scan evidence: valid `scanCompletedAt` + non-empty `scanEngine`;
- `claimRef = resource:<resource-id>`;
- matching storage provider;
- object bytes present;
- exact stored byte size;
- matching stored MIME type.

Output contains counts only. Object keys, DSNs and credentials are not printed.

Historical backup sets created before Files quarantine may contain claimed `ready` assets without scan evidence. Those restores intentionally remain HOLD until the Files worker rescans the legacy assets cleanly in the isolated restore target. Recovery verification never treats pre-quarantine `ready` alone as sufficient safety authority.

## 7. HTTP signed-download smoke

Use a dedicated restore-drill account/session and one restored Resource id:

```bash
export RESTORE_API_TARGET_ENV="restore-drill"
export RESTORE_API_BASE_URL="https://restore-api.example.invalid"
export RESTORE_API_BEARER="<ephemeral restore-drill bearer>"
export RESTORE_SAMPLE_RESOURCE_ID="<restored Resource UUID>"

pnpm recovery:smoke-api
```

The smoke requires:

- API readiness = `ready`;
- restored Resource can be read under real authorization;
- access issuance succeeds;
- capability response is `no-store`;
- the signed private download can actually be consumed;
- downloaded byte length and MIME agree with the restored Resource metadata.

The bearer and signed URL are never logged.

## 8. Files cleanup after restore

The restore drill is not complete merely because downloads work.

Start the normal Files cleanup worker against the isolated restored dependencies and require its healthcheck to become healthy. Then run the normal Files lifecycle/runtime smoke or an equivalent isolated expired-asset fixture and record that cleanup executes successfully.

Do not mutate production merely to manufacture cleanup evidence.

## 9. Off-host policy, cadence and retention

A backup set on the same VPS/volume as the live workload is **not** sufficient production recovery evidence.

Baseline for external Beta:

- create a recovery point at least daily while durable production data exists;
- create an additional recovery point immediately before schema-sensitive/destructive releases;
- copy completed sets to encrypted storage in an independent failure domain;
- keep at least 7 daily sets and 4 weekly sets until measured storage/RPO needs justify a reviewed change;
- access to backup storage follows least privilege and is separate from public application credentials;
- delete expired sets through a bounded retention job, never a global filesystem/cloud prune.

## 10. Restore-drill cadence and RPO/RTO

Run a full isolated restore drill:

- before first external Beta;
- after materially changing backup/restore tooling;
- at least monthly while production data is active;
- before relying on a new storage/database provider for recovery.

Record **observed** values:

- RPO: age of the recovery point used by the drill;
- RTO: elapsed time from restore start until application + signed-download + cleanup verification pass.

Do not publish invented RPO/RTO targets as achieved evidence.

## 11. Release evidence fields

For a destructive/data-sensitive release, the release record should include:

- recovery backup set id;
- source release SHA represented by that set;
- set creation timestamp/age at deployment;
- recovery gate result;
- off-host copy reference;
- last restore drill reference;
- observed RPO/RTO from that drill;
- schema compatibility/rollback notes.

No secret values belong in the release record.
