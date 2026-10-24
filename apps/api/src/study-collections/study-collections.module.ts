import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';

import { AuthModule } from '../auth/auth.module';
import { ResourcesModule } from '../resources/resources.module';
import { User, UserSchema } from '../users/schemas/user.schema';
import { StudyCollectionMembershipService } from './domain/study-collection-membership.service';
import { STUDY_COLLECTION_STORE } from './domain/study-collection.store';
import { StudyCollectionService } from './domain/study-collection.service';
import { MongoStudyCollectionStore } from './mongo/mongo-study-collection.store';
import {
  StudyCollection,
  StudyCollectionSchema,
} from './mongo/study-collection.mongo-schema';
import { StudyCollectionMembershipController } from './study-collection-membership.controller';
import { StudyCollectionsController } from './study-collections.controller';
import { StudyCollectionsFeatureGuard } from './study-collections-feature.guard';

// Owner + resource multikey predicate is applied before the page window.
StudyCollectionSchema.index({
  ownerUserId: 1,
  resourceIds: 1,
  updatedAt: -1,
  id: 1,
});

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
    StudyCollectionMembershipService,
    StudyCollectionsFeatureGuard,
    MongoStudyCollectionStore,
    {
      provide: STUDY_COLLECTION_STORE,
      useExisting: MongoStudyCollectionStore,
    },
  ],
  controllers: [
    StudyCollectionsController,
    StudyCollectionMembershipController,
  ],
})
export class StudyCollectionsModule {}
