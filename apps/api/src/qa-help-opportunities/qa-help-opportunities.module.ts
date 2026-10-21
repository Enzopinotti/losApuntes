import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';

import { AuthModule } from '../auth/auth.module';
import {
  AcademicSubjectParticipation,
  AcademicSubjectParticipationSchema,
} from '../academic/mongo/academic.mongo-schemas';
import { Question, QuestionSchema } from '../qa/mongo/qa.mongo-schemas';
import { QaHelpOpportunitiesController } from './qa-help-opportunities.controller';
import { QaHelpOpportunitiesService } from './qa-help-opportunities.service';

@Module({
  imports: [
    AuthModule,
    MongooseModule.forFeature([
      {
        name: AcademicSubjectParticipation.name,
        schema: AcademicSubjectParticipationSchema,
      },
      { name: Question.name, schema: QuestionSchema },
    ]),
  ],
  controllers: [QaHelpOpportunitiesController],
  providers: [QaHelpOpportunitiesService],
})
export class QaHelpOpportunitiesModule {}
