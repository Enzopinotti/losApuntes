import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';

import { AuthModule } from '../auth/auth.module';
import { Question, QuestionSchema } from '../qa/mongo/qa.mongo-schemas';
import { QaDiscussionsController } from './qa-discussions.controller';
import { QaDiscussionsService } from './qa-discussions.service';

@Module({
  imports: [
    AuthModule,
    MongooseModule.forFeature([
      { name: Question.name, schema: QuestionSchema },
    ]),
  ],
  controllers: [QaDiscussionsController],
  providers: [QaDiscussionsService],
})
export class QaDiscussionsModule {}
