import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';

import { AcademicModule } from '../academic/academic.module';
import { AuthModule } from '../auth/auth.module';
import { Question, QuestionSchema } from '../qa/mongo/qa.mongo-schemas';
import { QaSolvedLibraryController } from './qa-solved-library.controller';
import { QaSolvedLibraryService } from './qa-solved-library.service';

@Module({
  imports: [
    AuthModule,
    AcademicModule,
    MongooseModule.forFeature([
      { name: Question.name, schema: QuestionSchema },
    ]),
  ],
  controllers: [QaSolvedLibraryController],
  providers: [QaSolvedLibraryService],
})
export class QaSolvedLibraryModule {}
