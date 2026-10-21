import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';

import { AuthModule } from '../auth/auth.module';
import { QaModule } from '../qa/qa.module';
import { ResourcesModule } from '../resources/resources.module';
import {
  StudyProgress,
  StudyProgressSchema,
} from '../study-progress/mongo/study-progress.schema';
import { StudyProgressFeatureGuard } from '../study-progress/study-progress.feature.guard';
import { StudyTaskReferenceCheckController } from './study-task-reference-check.controller';
import { StudyTaskReferenceCheckService } from './study-task-reference-check.service';

@Module({
  imports: [
    AuthModule,
    QaModule,
    ResourcesModule,
    MongooseModule.forFeature([
      { name: StudyProgress.name, schema: StudyProgressSchema },
    ]),
  ],
  controllers: [StudyTaskReferenceCheckController],
  providers: [StudyTaskReferenceCheckService, StudyProgressFeatureGuard],
})
export class StudyTaskReferenceCheckModule {}
