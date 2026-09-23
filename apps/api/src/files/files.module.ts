import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { MongooseModule } from '@nestjs/mongoose';

import { AuthModule } from '../auth/auth.module';
import { requireConfigString } from '../config/required-config';
import { UsersModule } from '../users/users.module';
import { FilesController } from './files.controller';
import { FILE_ASSET_STORE } from './domain/file.store';
import { FileService } from './domain/file.service';
import { FileAsset, FileAssetSchema } from './mongo/file.mongo-schema';
import { MongoFileAssetStore } from './mongo/mongo-file.store';
import { OBJECT_STORAGE } from './storage/object-storage';
import { createS3ObjectStorage } from './storage/s3-object-storage';

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
  exports: [FileService, MongooseModule],
})
export class FilesModule {}
