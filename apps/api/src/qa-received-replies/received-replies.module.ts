import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';

import { AuthModule } from '../auth/auth.module';
import { Question, QuestionSchema } from '../qa/mongo/qa.mongo-schemas';
import { ReceivedRepliesController } from './received-replies.controller';
import { ReceivedRepliesService } from './received-replies.service';

@Module({
  imports: [
    AuthModule,
    MongooseModule.forFeature([
      { name: Question.name, schema: QuestionSchema },
    ]),
  ],
  controllers: [ReceivedRepliesController],
  providers: [ReceivedRepliesService],
})
export class ReceivedRepliesModule {}
