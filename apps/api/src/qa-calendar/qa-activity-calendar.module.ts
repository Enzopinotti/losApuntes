import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';

import { AuthModule } from '../auth/auth.module';
import {
  Answer,
  AnswerSchema,
  Question,
  QuestionSchema,
} from '../qa/mongo/qa.mongo-schemas';
import { QaActivityCalendarController } from './qa-activity-calendar.controller';
import { QaActivityCalendarService } from './qa-activity-calendar.service';

@Module({
  imports: [
    AuthModule,
    MongooseModule.forFeature([
      { name: Question.name, schema: QuestionSchema },
      { name: Answer.name, schema: AnswerSchema },
    ]),
  ],
  controllers: [QaActivityCalendarController],
  providers: [QaActivityCalendarService],
})
export class QaActivityCalendarModule {}
