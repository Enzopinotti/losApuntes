import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';

import { AuthModule } from '../auth/auth.module';
import { Question, QuestionSchema } from '../qa/mongo/qa.mongo-schemas';
import { QaCardStatusController } from './qa-card-status.controller';
import { QaCardStatusService } from './qa-card-status.service';

@Module({
  imports: [
    AuthModule,
    MongooseModule.forFeature([
      { name: Question.name, schema: QuestionSchema },
    ]),
  ],
  controllers: [QaCardStatusController],
  providers: [QaCardStatusService],
})
export class QaCardStatusModule {}
