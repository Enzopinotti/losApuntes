import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';

import { AuthModule } from '../auth/auth.module';
import {
  Answer,
  AnswerSchema,
  Question,
  QuestionSchema,
} from '../qa/mongo/qa.mongo-schemas';
import { QaActivitySummaryController } from './qa-activity-summary.controller';
import { QaActivitySummaryService } from './qa-activity-summary.service';

@Module({
  imports: [
    AuthModule,
    MongooseModule.forFeature([
      { name: Question.name, schema: QuestionSchema },
      { name: Answer.name, schema: AnswerSchema },
    ]),
  ],
  controllers: [QaActivitySummaryController],
  providers: [QaActivitySummaryService],
})
export class QaActivitySummaryModule {}
