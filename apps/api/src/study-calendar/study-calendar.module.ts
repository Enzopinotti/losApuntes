import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';

import { AuthModule } from '../auth/auth.module';
import {
  StudyProgress,
  StudyProgressSchema,
} from '../study-progress/mongo/study-progress.schema';
import { StudyProgressFeatureGuard } from '../study-progress/study-progress.feature.guard';
import { StudyCalendarController } from './study-calendar.controller';
import { StudyCalendarService } from './study-calendar.service';

@Module({
  imports: [
    AuthModule,
    MongooseModule.forFeature([
      { name: StudyProgress.name, schema: StudyProgressSchema },
    ]),
  ],
  controllers: [StudyCalendarController],
  providers: [StudyCalendarService, StudyProgressFeatureGuard],
})
export class StudyCalendarModule {}
