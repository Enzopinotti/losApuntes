import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { AuthModule } from '../auth/auth.module';
import { UsersModule } from '../users/users.module';
import { User, UserSchema } from '../users/schemas/user.schema';
import { StudyProgressController } from './study-progress.controller';
import { StudySessionSummaryModule } from './study-session-summary.module';
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
    StudySessionSummaryModule,
  ],
  providers: [StudyProgressService, StudyProgressFeatureGuard],
  controllers: [StudyProgressController],
})
export class StudyProgressModule {}
