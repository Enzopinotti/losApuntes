import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { MongooseModule } from '@nestjs/mongoose';

import { AuthModule } from '../auth/auth.module';
import { requireConfigString } from '../config/required-config';
import { UsersModule } from '../users/users.module';
import { FILE_ASSET_STORE } from './domain/file.store';
import { FileService } from './domain/file.service';
import { FilesController } from './files.controller';
import { FileAsset, FileAssetSchema } from './mongo/file.mongo-schema';
import { MongoFileAssetStore } from './mongo/mongo-file.store';
import { createClamAvFileSafetyScanner } from './safety/clamav-file-safety-scanner';
import { createDeterministicFileSafetyScanner } from './safety/deterministic-file-safety-scanner';
import { FILE_SAFETY_SCANNER } from './safety/file-safety-scanner';
import { OBJECT_STORAGE } from './storage/object-storage';
import { createS3ObjectStorage } from './storage/s3-object-storage';

function boundedInteger(
  config: ConfigService,
  key: string,
  minimum: number,
  maximum: number,
  fallback: number,
): number {
  const raw = config.get<string>(key)?.trim();
  if (!raw) return fallback;

  const value = Number(raw);
  if (!Number.isSafeInteger(value) || value < minimum || value > maximum) {
    throw new Error(
      `${key} must be an integer between ${minimum} and ${maximum}`,
    );
  }
  return value;
}

@Module({
  imports: [
    AuthModule,
    UsersModule,
    MongooseModule.forFeature([
      { name: FileAsset.name, schema: FileAssetSchema },
    ]),
  ],
  controllers: [FilesController],
  providers: [
    FileService,
    MongoFileAssetStore,
    {
      provide: FILE_ASSET_STORE,
      useExisting: MongoFileAssetStore,
    },
    {
      provide: FILE_SAFETY_SCANNER,
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const configured = config.get<string>('FILES_SAFETY_SCANNER')?.trim();
        const driver =
          configured ||
          (process.env.NODE_ENV === 'test' ? 'deterministic' : '');

        if (driver === 'deterministic') {
          const profile = config.get<string>('DEPLOYMENT_PROFILE')?.trim();
          if (process.env.NODE_ENV === 'production' && profile !== 'local') {
            throw new Error(
              'FILES_SAFETY_SCANNER=deterministic is restricted to local runtime',
            );
          }
          return createDeterministicFileSafetyScanner();
        }

        if (driver === 'clamav') {
          return createClamAvFileSafetyScanner({
            host: requireConfigString(config, 'FILES_CLAMAV_HOST'),
            port: boundedInteger(config, 'FILES_CLAMAV_PORT', 1, 65_535, 3310),
            timeoutMs: boundedInteger(
              config,
              'FILES_CLAMAV_TIMEOUT_MS',
              1_000,
              120_000,
              30_000,
            ),
          });
        }

        throw new Error('FILES_SAFETY_SCANNER must be deterministic or clamav');
      },
    },
    {
      provide: OBJECT_STORAGE,
      inject: [ConfigService],
      useFactory: (config: ConfigService) =>
        createS3ObjectStorage({
          endpoint: requireConfigString(config, 'FILES_S3_ENDPOINT'),
          publicEndpoint:
            config.get<string>('FILES_S3_PUBLIC_ENDPOINT')?.trim() || undefined,
          region: requireConfigString(config, 'FILES_S3_REGION'),
          bucket: requireConfigString(config, 'FILES_S3_BUCKET'),
          accessKeyId: requireConfigString(config, 'FILES_S3_ACCESS_KEY_ID'),
          secretAccessKey: requireConfigString(
            config,
            'FILES_S3_SECRET_ACCESS_KEY',
          ),
          providerId: 's3',
        }),
    },
  ],
  exports: [FileService, MongooseModule, OBJECT_STORAGE, FILE_SAFETY_SCANNER],
})
export class FilesModule {}
