import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';

import { AuthModule } from '../auth/auth.module';
import {
  StudyProgress,
  StudyProgressSchema,
} from '../study-progress/mongo/study-progress.schema';
import { StudyProgressFeatureGuard } from '../study-progress/study-progress.feature.guard';
import { StudyNextActionsController } from './study-next-actions.controller';
import { StudyNextActionsService } from './study-next-actions.service';

@Module({
  imports: [
    AuthModule,
    MongooseModule.forFeature([
      { name: StudyProgress.name, schema: StudyProgressSchema },
    ]),
  ],
  controllers: [StudyNextActionsController],
  providers: [StudyNextActionsService, StudyProgressFeatureGuard],
})
export class StudyNextActionsModule {}
