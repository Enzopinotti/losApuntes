import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { AuthModule } from '../auth/auth.module';
import { UsersModule } from '../users/users.module';
import { User, UserSchema } from '../users/schemas/user.schema';
import { StudyProgressController } from './study-progress.controller';
import { StudySessionSummaryController } from './study-session-summary.controller';
import { StudySessionSummaryService } from './study-session-summary.service';
import { StudyProgressFeatureGuard } from './study-progress.feature.guard';
import { StudyProgressService } from './study-progress.service';
import {
  StudyProgress,
  StudyProgressSchema,
} from './mongo/study-progress.schema';

@Module({
  imports: [
    AuthModule,
    UsersModule,
    MongooseModule.forFeature([
      { name: User.name, schema: UserSchema },
      { name: StudyProgress.name, schema: StudyProgressSchema },
    ]),
  ],
  providers: [
    StudyProgressService,
    StudyProgressFeatureGuard,
    StudySessionSummaryService,
  ],
  controllers: [StudyProgressController, StudySessionSummaryController],
})
export class StudyProgressModule {}
