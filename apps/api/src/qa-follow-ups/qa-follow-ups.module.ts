import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';

import { AuthModule } from '../auth/auth.module';
import { Question, QuestionSchema } from '../qa/mongo/qa.mongo-schemas';
import { QaFollowUpsController } from './qa-follow-ups.controller';
import { QaFollowUpsService } from './qa-follow-ups.service';

@Module({
  imports: [
    AuthModule,
    MongooseModule.forFeature([
      { name: Question.name, schema: QuestionSchema },
    ]),
  ],
  controllers: [QaFollowUpsController],
  providers: [QaFollowUpsService],
})
export class QaFollowUpsModule {}
