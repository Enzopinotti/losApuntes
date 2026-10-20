import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';

import { AcademicModule } from '../academic/academic.module';
import { AuthModule } from '../auth/auth.module';
import { FilesModule } from '../files/files.module';
import { FileAsset, FileAssetSchema } from '../files/mongo/file.mongo-schema';
import { PilotTelemetryModule } from '../pilot/telemetry/pilot-telemetry.module';
import { ProfileModule } from '../profile/profile.module';
import { UsersModule } from '../users/users.module';
import { ResourceService } from './domain/resource.service';
import { ResourceSavedSearchService } from './domain/resource-saved-search.service';
import { RESOURCE_EXPORT_STORE } from './domain/resource-export.store';
import { RESOURCE_STORE } from './domain/resource.store';
import { SAVED_RESOURCE_SEARCH_STORE } from './domain/resource-saved-search.store';
import { MongoResourceExportStore } from './mongo/mongo-resource-export.store';
import { MongoResourceStore } from './mongo/mongo-resource.store';
import {
  Resource,
  ResourceReport,
  ResourceReportSchema,
  ResourceSave,
  ResourceSaveSchema,
  ResourceSchema,
  ResourceShare,
  ResourceShareSchema,
} from './mongo/resource.mongo-schemas';
import { ResourceSavedOverviewController } from './resource-saved-overview.controller';
import { ResourceSavedOverviewService } from './resource-saved-overview.service';
import { ResourcesController } from './resources.controller';
import { ResourceSavedSearchController } from './resource-saved-search.controller';

@Module({
  imports: [
    AuthModule,
    UsersModule,
    AcademicModule,
    ProfileModule,
    PilotTelemetryModule,
    FilesModule,
    MongooseModule.forFeature([
      { name: Resource.name, schema: ResourceSchema },
      { name: ResourceShare.name, schema: ResourceShareSchema },
      { name: ResourceSave.name, schema: ResourceSaveSchema },
      { name: ResourceReport.name, schema: ResourceReportSchema },
      { name: FileAsset.name, schema: FileAssetSchema },
    ]),
  ],
  providers: [
    ResourceService,
    ResourceSavedOverviewService,
    ResourceSavedSearchService,
    MongoResourceExportStore,
    MongoResourceStore,
    {
      provide: RESOURCE_EXPORT_STORE,
      useExisting: MongoResourceExportStore,
    },
    {
      provide: RESOURCE_STORE,
      useExisting: MongoResourceStore,
    },
    {
      provide: SAVED_RESOURCE_SEARCH_STORE,
      useExisting: MongoResourceStore,
    },
  ],
  controllers: [
    ResourcesController,
    ResourceSavedSearchController,
    ResourceSavedOverviewController,
  ],
  exports: [ResourceService],
})
export class ResourcesModule {}
