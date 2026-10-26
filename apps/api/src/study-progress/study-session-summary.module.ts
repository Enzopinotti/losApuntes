import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';

import { AuthModule } from '../auth/auth.module';
import {
  StudyProgress,
  StudyProgressSchema,
} from './mongo/study-progress.schema';
import { StudyProgressFeatureGuard } from './study-progress.feature.guard';
import { StudySessionSummaryController } from './study-session-summary.controller';
import { StudySessionSummaryService } from './study-session-summary.service';

/**
 * Isolated read-only submodule. The original StudyProgressModule keeps its
 * exact protected provider list and account-lifecycle mutation boundary.
 */
@Module({
  imports: [
    AuthModule,
    MongooseModule.forFeature([
      { name: StudyProgress.name, schema: StudyProgressSchema },
    ]),
  ],
  providers: [StudyProgressFeatureGuard, StudySessionSummaryService],
  controllers: [StudySessionSummaryController],
})
export class StudySessionSummaryModule {}
