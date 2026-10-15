import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { AuthModule } from '../auth/auth.module';
import { User, UserSchema } from '../users/schemas/user.schema';
import { StudyProgressController } from './study-progress.controller';
import { StudyProgressFeatureGuard } from './study-progress.feature.guard';
import { StudyProgressService } from './study-progress.service';
import { StudyProgress, StudyProgressSchema } from './mongo/study-progress.schema';

@Module({
  imports: [
    AuthModule,
    MongooseModule.forFeature([
      { name: User.name, schema: UserSchema },
      { name: StudyProgress.name, schema: StudyProgressSchema },
    ]),
  ],
  providers: [StudyProgressService, StudyProgressFeatureGuard],
  controllers: [StudyProgressController],
})
export class StudyProgressModule {}
