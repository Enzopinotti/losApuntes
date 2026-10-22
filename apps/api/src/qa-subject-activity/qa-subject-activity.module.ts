import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';

import { AuthModule } from '../auth/auth.module';
import { Question, QuestionSchema } from '../qa/mongo/qa.mongo-schemas';
import { QaSubjectActivityController } from './qa-subject-activity.controller';
import { QaSubjectActivityService } from './qa-subject-activity.service';

@Module({
  imports: [
    AuthModule,
    MongooseModule.forFeature([
      { name: Question.name, schema: QuestionSchema },
    ]),
  ],
  providers: [QaSubjectActivityService],
  controllers: [QaSubjectActivityController],
})
export class QaSubjectActivityModule {}
