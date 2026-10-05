import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';

import { AuthModule } from '../auth/auth.module';
import {
  OrganizationManager,
  OrganizationManagerSchema,
} from '../organizations/mongo/organization.mongo-schemas';
import { ProfileModule } from '../profile/profile.module';
import { Profile, ProfileSchema } from '../profile/mongo/profile.mongo-schemas';
import { User, UserSchema } from '../users/schemas/user.schema';
import { UsersModule } from '../users/users.module';
import { AccountLifecycleController } from './account-lifecycle.controller';
import {
  AccountIdentityExportContributor,
  ProfileActivitiesExportContributor,
  ProfileExportContributor,
} from './contributors/account-export-core.contributors';
import {
  ACCOUNT_EXPORT_CONTRIBUTORS,
  AccountExportContributorRegistry,
} from './domain/account-export-contributor.registry';
import { AccountExportService } from './domain/account-export.service';
import { ACCOUNT_EXPORT_STORE } from './domain/account-export.store';
import { AccountLifecycleService } from './domain/account-lifecycle.service';
import { ACCOUNT_LIFECYCLE_STORE } from './domain/account-lifecycle.store';
import {
  AccountExportJob,
  AccountExportJobSchema,
} from './mongo/account-export.mongo-schema';
import { MongoAccountExportStore } from './mongo/mongo-account-export.store';
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
    ProfileModule,
    MongooseModule.forFeature([
      { name: User.name, schema: UserSchema },
      { name: Profile.name, schema: ProfileSchema },
      { name: OrganizationManager.name, schema: OrganizationManagerSchema },
      { name: AccountOffboardingJob.name, schema: AccountOffboardingJobSchema },
      { name: AccountExportJob.name, schema: AccountExportJobSchema },
      { name: SecurityAudit.name, schema: SecurityAuditSchema },
    ]),
  ],
  controllers: [AccountLifecycleController],
  providers: [
    AccountLifecycleService,
    AccountExportService,
    AccountIdentityExportContributor,
    ProfileExportContributor,
    ProfileActivitiesExportContributor,
    {
      provide: ACCOUNT_EXPORT_CONTRIBUTORS,
      useFactory: (
        account: AccountIdentityExportContributor,
        profile: ProfileExportContributor,
        activities: ProfileActivitiesExportContributor,
      ) => [account, profile, activities],
      inject: [
        AccountIdentityExportContributor,
        ProfileExportContributor,
        ProfileActivitiesExportContributor,
      ],
    },
    AccountExportContributorRegistry,
    MongoAccountLifecycleStore,
    MongoAccountExportStore,
    {
      provide: ACCOUNT_LIFECYCLE_STORE,
      useExisting: MongoAccountLifecycleStore,
    },
    {
      provide: ACCOUNT_EXPORT_STORE,
      useExisting: MongoAccountExportStore,
    },
  ],
  exports: [
    AccountLifecycleService,
    AccountExportService,
    AccountExportContributorRegistry,
  ],
})
export class DataLifecycleModule {}
