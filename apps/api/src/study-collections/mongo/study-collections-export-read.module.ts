import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';

import {
  StudyCollection,
  StudyCollectionSchema,
} from './study-collection.mongo-schema';
import { StudyCollectionExportReader } from './study-collection-export.reader';

/**
 * Read-only dependency: importing it does NOT register the Study Collections
 * controller or activate CRUD persistence in the API's AppModule.
 */
@Module({
  imports: [
    MongooseModule.forFeature([
      { name: StudyCollection.name, schema: StudyCollectionSchema },
    ]),
  ],
  providers: [StudyCollectionExportReader],
  exports: [StudyCollectionExportReader],
})
export class StudyCollectionsExportReadModule {}
