import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';

import { AuthModule } from '../auth/auth.module';
import { ResourcesModule } from '../resources/resources.module';
import { STUDY_COLLECTION_STORE } from './domain/study-collection.store';
import { StudyCollectionService } from './domain/study-collection.service';
import { MongoStudyCollectionStore } from './mongo/mongo-study-collection.store';
import {
  StudyCollection,
  StudyCollectionSchema,
} from './mongo/study-collection.mongo-schema';
import { StudyCollectionsController } from './study-collections.controller';

@Module({
  imports: [
    AuthModule,
    ResourcesModule,
    MongooseModule.forFeature([
      { name: StudyCollection.name, schema: StudyCollectionSchema },
    ]),
  ],
  providers: [
    StudyCollectionService,
    MongoStudyCollectionStore,
    {
      provide: STUDY_COLLECTION_STORE,
      useExisting: MongoStudyCollectionStore,
    },
  ],
  controllers: [StudyCollectionsController],
})
export class StudyCollectionsModule {}
