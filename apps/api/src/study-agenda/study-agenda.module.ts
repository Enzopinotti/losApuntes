import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';

import { AuthModule } from '../auth/auth.module';
import {
  StudyProgress,
  StudyProgressSchema,
} from '../study-progress/mongo/study-progress.schema';
import { StudyProgressFeatureGuard } from '../study-progress/study-progress.feature.guard';
import { StudyAgendaController } from './study-agenda.controller';
import { StudyAgendaService } from './study-agenda.service';

@Module({
  imports: [
    AuthModule,
    MongooseModule.forFeature([
      { name: StudyProgress.name, schema: StudyProgressSchema },
    ]),
  ],
  controllers: [StudyAgendaController],
  providers: [StudyAgendaService, StudyProgressFeatureGuard],
})
export class StudyAgendaModule {}
