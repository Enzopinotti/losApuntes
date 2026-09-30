import { createConnection } from 'mongoose';

import { createS3ObjectStorage } from '../files/storage/s3-object-storage';

type ResourceRow = {
  id: string;
  assetId: string;
};

type FileAssetRow = {
  id: string;
  provider: string;
  objectKey: string;
  verifiedMimeType?: string;
  actualByteSize?: number;
  state: string;
  claimRef?: string | null;
};

function required(name: string, maximumLength = 4096): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required`);
  if (value.length > maximumLength) {
    throw new Error(`${name} exceeds its maximum accepted length`);
  }
  return value;
}

function nonProductionTarget(): string {
  const value = required('RESTORE_VERIFY_TARGET_ENV', 64);
  const normalized = value.toLowerCase();
  if (
    ['prod', 'production', 'prd', 'live', 'public'].includes(normalized) ||
    normalized.includes('production')
  ) {
    throw new Error('recovery verification refuses production targets');
  }
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/u.test(value)) {
    throw new Error('RESTORE_VERIFY_TARGET_ENV is invalid');
  }
  return value;
}

function timeoutMs(): number {
  const raw = process.env.RESTORE_VERIFY_TIMEOUT_MS?.trim();
  if (!raw) return 5_000;
  const value = Number(raw);
  if (!Number.isSafeInteger(value) || value < 500 || value > 30_000) {
    throw new Error(
      'RESTORE_VERIFY_TIMEOUT_MS must be an integer between 500 and 30000',
    );
  }
  return value;
}

async function main(): Promise<void> {
  const targetEnvironment = nonProductionTarget();
  const mongoUri = required('RESTORE_VERIFY_MONGO_URI');
  const storage = createS3ObjectStorage({
    endpoint: required('RESTORE_VERIFY_FILES_ENDPOINT', 2048),
    region: required('RESTORE_VERIFY_FILES_REGION', 128),
    bucket: required('RESTORE_VERIFY_FILES_BUCKET', 255),
    accessKeyId: required('RESTORE_VERIFY_FILES_ACCESS_KEY_ID', 512),
    secretAccessKey: required('RESTORE_VERIFY_FILES_SECRET_ACCESS_KEY'),
    providerId: 's3',
  });
  const storageTimeoutMs = timeoutMs();

  const connection = createConnection(mongoUri, {
    serverSelectionTimeoutMS: 5_000,
  });
  await connection.asPromise();

  let resourcesChecked = 0;
  let filesChecked = 0;

  try {
    if (!connection.db) {
      throw new Error('Mongo connection has no database');
    }

    const resources = connection.db.collection<ResourceRow>('resources');
    const assets = connection.db.collection<FileAssetRow>('file_assets');
    const cursor = resources.find(
      {},
      { projection: { _id: 0, id: 1, assetId: 1 } },
    );

    for await (const resource of cursor) {
      resourcesChecked += 1;
      if (
        typeof resource.id !== 'string' ||
        typeof resource.assetId !== 'string'
      ) {
        throw new Error('Resource recovery metadata is malformed');
      }

      const asset = await assets.findOne(
        { id: resource.assetId },
        {
          projection: {
            _id: 0,
            id: 1,
            provider: 1,
            objectKey: 1,
            verifiedMimeType: 1,
            actualByteSize: 1,
            state: 1,
            claimRef: 1,
          },
        },
      );

      if (
        !asset ||
        asset.state !== 'ready' ||
        asset.provider !== storage.providerId ||
        asset.claimRef !== `resource:${resource.id}` ||
        typeof asset.objectKey !== 'string' ||
        typeof asset.verifiedMimeType !== 'string' ||
        !Number.isSafeInteger(asset.actualByteSize) ||
        (asset.actualByteSize ?? -1) < 0
      ) {
        throw new Error('Resource/FileAsset recovery relationship is invalid');
      }

      const object = await storage.headObject(
        asset.objectKey,
        storageTimeoutMs,
      );
      if (
        !object ||
        object.byteSize !== asset.actualByteSize ||
        object.contentType !== asset.verifiedMimeType
      ) {
        throw new Error(
          'FileAsset/object storage recovery relationship is invalid',
        );
      }

      filesChecked += 1;
    }
  } finally {
    await connection.close();
  }

  console.log(
    JSON.stringify({
      event: 'recovery.application.verify',
      status: 'PASS',
      targetEnvironment,
      resourcesChecked,
      filesChecked,
      checkedAt: new Date().toISOString(),
    }),
  );
}

void main().catch((error: unknown) => {
  console.error(
    JSON.stringify({
      event: 'recovery.application.verify',
      status: 'HOLD',
      errorType: error instanceof Error ? error.name : 'UnknownError',
    }),
  );
  process.exitCode = 2;
});
