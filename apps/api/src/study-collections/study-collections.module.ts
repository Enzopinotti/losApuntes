import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';

import { AuthModule } from '../auth/auth.module';
import { ResourcesModule } from '../resources/resources.module';
import { User, UserSchema } from '../users/schemas/user.schema';
import { StudyCollectionOrderService } from './domain/study-collection-order.service';
import { STUDY_COLLECTION_STORE } from './domain/study-collection.store';
import { StudyCollectionService } from './domain/study-collection.service';
import { MongoStudyCollectionStore } from './mongo/mongo-study-collection.store';
import {
  StudyCollection,
  StudyCollectionSchema,
} from './mongo/study-collection.mongo-schema';
import { StudyCollectionOrderController } from './study-collection-order.controller';
import { StudyCollectionsController } from './study-collections.controller';
import { StudyCollectionsFeatureGuard } from './study-collections-feature.guard';

@Module({
  imports: [
    AuthModule,
    ResourcesModule,
    MongooseModule.forFeature([
      { name: StudyCollection.name, schema: StudyCollectionSchema },
      { name: User.name, schema: UserSchema },
    ]),
  ],
  providers: [
    StudyCollectionService,
    StudyCollectionOrderService,
    StudyCollectionsFeatureGuard,
    MongoStudyCollectionStore,
    {
      provide: STUDY_COLLECTION_STORE,
      useExisting: MongoStudyCollectionStore,
    },
  ],
  controllers: [StudyCollectionsController, StudyCollectionOrderController],
})
export class StudyCollectionsModule {}
