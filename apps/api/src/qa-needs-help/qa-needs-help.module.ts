import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';

import { AcademicModule } from '../academic/academic.module';
import { AuthModule } from '../auth/auth.module';
import { Question, QuestionSchema } from '../qa/mongo/qa.mongo-schemas';
import { QaNeedsHelpController } from './qa-needs-help.controller';
import { QaNeedsHelpService } from './qa-needs-help.service';

@Module({
  imports: [
    AuthModule,
    AcademicModule,
    MongooseModule.forFeature([
      { name: Question.name, schema: QuestionSchema },
    ]),
  ],
  controllers: [QaNeedsHelpController],
  providers: [QaNeedsHelpService],
})
export class QaNeedsHelpModule {}
