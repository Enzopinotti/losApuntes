import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';

import { AuthModule } from '../auth/auth.module';
import {
  OrganizationManager,
  OrganizationManagerSchema,
} from '../organizations/mongo/organization.mongo-schemas';
import { Profile, ProfileSchema } from '../profile/mongo/profile.mongo-schemas';
import { User, UserSchema } from '../users/schemas/user.schema';
import { UsersModule } from '../users/users.module';
import { AccountLifecycleController } from './account-lifecycle.controller';
import { AccountLifecycleService } from './domain/account-lifecycle.service';
import { ACCOUNT_LIFECYCLE_STORE } from './domain/account-lifecycle.store';
import { MongoAccountLifecycleStore } from './mongo/mongo-account-lifecycle.store';
import {
  AccountOffboardingJob,
  AccountOffboardingJobSchema,
  SecurityAudit,
  SecurityAuditSchema,
} from './mongo/data-lifecycle.mongo-schemas';

@Module({
  imports: [
    AuthModule,
    UsersModule,
    MongooseModule.forFeature([
      { name: User.name, schema: UserSchema },
      { name: Profile.name, schema: ProfileSchema },
      { name: OrganizationManager.name, schema: OrganizationManagerSchema },
      { name: AccountOffboardingJob.name, schema: AccountOffboardingJobSchema },
      { name: SecurityAudit.name, schema: SecurityAuditSchema },
    ]),
  ],
  controllers: [AccountLifecycleController],
  providers: [
    AccountLifecycleService,
    MongoAccountLifecycleStore,
    {
      provide: ACCOUNT_LIFECYCLE_STORE,
      useExisting: MongoAccountLifecycleStore,
    },
  ],
  exports: [AccountLifecycleService],
})
export class DataLifecycleModule {}
