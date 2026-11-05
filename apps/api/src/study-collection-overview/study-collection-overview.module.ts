import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';

import { AuthModule } from '../auth/auth.module';
import {
  StudyCollection,
  StudyCollectionSchema,
} from '../study-collections/mongo/study-collection.mongo-schema';
import { StudyCollectionsFeatureGuard } from '../study-collections/study-collections-feature.guard';
import { StudyCollectionOverviewController } from './study-collection-overview.controller';
import { StudyCollectionOverviewService } from './study-collection-overview.service';

// Filter by authenticated owner and stream in recent-update order before the
// facet; do not change any existing StudyCollection documents or writes.
StudyCollectionSchema.index({ ownerUserId: 1, updatedAt: -1, id: 1 });

@Module({
  imports: [
    AuthModule,
    MongooseModule.forFeature([
      { name: StudyCollection.name, schema: StudyCollectionSchema },
    ]),
  ],
  providers: [StudyCollectionsFeatureGuard, StudyCollectionOverviewService],
  controllers: [StudyCollectionOverviewController],
})
export class StudyCollectionOverviewModule {}
