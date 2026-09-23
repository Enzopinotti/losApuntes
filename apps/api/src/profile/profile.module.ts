import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';

import { AcademicModule } from '../academic/academic.module';
import { AuthModule } from '../auth/auth.module';
import { ProfileController } from './profile.controller';
import { ProfileService } from './domain/profile.service';
import { PROFILE_STORE } from './domain/profile.store';
import {
  Profile,
  ProfileActivity,
  ProfileActivitySchema,
  ProfileSchema,
} from './mongo/profile.mongo-schemas';
import { MongoProfileStore } from './mongo/mongo-profile.store';

@Module({
  imports: [
    AuthModule,
    AcademicModule,
    MongooseModule.forFeature([
      { name: Profile.name, schema: ProfileSchema },
      { name: ProfileActivity.name, schema: ProfileActivitySchema },
    ]),
  ],
  controllers: [ProfileController],
  providers: [
    ProfileService,
    MongoProfileStore,
    {
      provide: PROFILE_STORE,
      useExisting: MongoProfileStore,
    },
  ],
  exports: [ProfileService],
})
export class ProfileModule {}
