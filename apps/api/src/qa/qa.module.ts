import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';

import { AcademicModule } from '../academic/academic.module';
import { AuthModule } from '../auth/auth.module';
import {
  Notification,
  NotificationSchema,
} from '../notifications/mongo/notification.mongo-schema';
import { PilotTelemetryModule } from '../pilot/telemetry/pilot-telemetry.module';
import { ProfileModule } from '../profile/profile.module';
import { UsersModule } from '../users/users.module';
import { QaService } from './domain/qa.service';
import { QA_STORE } from './domain/qa.store';
import { MongoQaStore } from './mongo/mongo-qa.store';
import {
  Answer,
  AnswerSchema,
  QaReport,
  QaReportSchema,
  Question,
  QuestionSchema,
} from './mongo/qa.mongo-schemas';
import { QuestionsController } from './questions.controller';

@Module({
  imports: [
    AuthModule,
    UsersModule,
    AcademicModule,
    ProfileModule,
    PilotTelemetryModule,
    MongooseModule.forFeature([
      { name: Question.name, schema: QuestionSchema },
      { name: Answer.name, schema: AnswerSchema },
      { name: QaReport.name, schema: QaReportSchema },
      { name: Notification.name, schema: NotificationSchema },
    ]),
  ],
  providers: [
    QaService,
    MongoQaStore,
    {
      provide: QA_STORE,
      useExisting: MongoQaStore,
    },
  ],
  controllers: [QuestionsController],
  exports: [QaService],
})
export class QaModule {}
