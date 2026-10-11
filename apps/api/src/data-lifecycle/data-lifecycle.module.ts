import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';

import { AcademicModule } from '../academic/academic.module';
import { AuthModule } from '../auth/auth.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { OrganizationsModule } from '../organizations/organizations.module';
import {
  OrganizationManager,
  OrganizationManagerSchema,
} from '../organizations/mongo/organization.mongo-schemas';
import { ProfileModule } from '../profile/profile.module';
import { QaModule } from '../qa/qa.module';
import { ResourcesModule } from '../resources/resources.module';
import { SocialModule } from '../social/social.module';
import { Profile, ProfileSchema } from '../profile/mongo/profile.mongo-schemas';
import { User, UserSchema } from '../users/schemas/user.schema';
import { UsersModule } from '../users/users.module';
import { AccountLifecycleController } from './account-lifecycle.controller';
import {
  AcademicAffiliationsExportContributor,
  AcademicCurrentContextExportContributor,
  AcademicFollowsExportContributor,
  AcademicSubjectParticipationsExportContributor,
} from './contributors/account-export-academic.contributors';
import {
  AccountIdentityExportContributor,
  ProfileActivitiesExportContributor,
  ProfileExportContributor,
} from './contributors/account-export-core.contributors';
import {
  AuthoredResourcesExportContributor,
  SavedResourcesExportContributor,
  SharedResourceGrantsExportContributor,
} from './contributors/account-export-resource.contributors';
import {
  AuthoredAnswersExportContributor,
  AuthoredQuestionsExportContributor,
} from './contributors/account-export-qa.contributors';
import { NotificationInboxExportContributor } from './contributors/account-export-notifications.contributors';
import { OrganizationFollowingExportContributor } from './contributors/account-export-organization-following.contributors';
import {
  SocialConnectionsExportContributor,
  SocialFollowingExportContributor,
} from './contributors/account-export-social.contributors';
import { AccountExportAssembler } from './domain/account-export-assembler';
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
    AcademicModule,
    AuthModule,
    NotificationsModule,
    OrganizationsModule,
    UsersModule,
    ProfileModule,
    QaModule,
    ResourcesModule,
    SocialModule,
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
    AccountExportAssembler,
    AccountIdentityExportContributor,
    ProfileExportContributor,
    ProfileActivitiesExportContributor,
    AcademicAffiliationsExportContributor,
    AcademicSubjectParticipationsExportContributor,
    AcademicCurrentContextExportContributor,
    AcademicFollowsExportContributor,
    AuthoredResourcesExportContributor,
    SavedResourcesExportContributor,
    SharedResourceGrantsExportContributor,
    AuthoredQuestionsExportContributor,
    AuthoredAnswersExportContributor,
    NotificationInboxExportContributor,
    OrganizationFollowingExportContributor,
    SocialFollowingExportContributor,
    SocialConnectionsExportContributor,
    {
      provide: ACCOUNT_EXPORT_CONTRIBUTORS,
      useFactory: (
        account: AccountIdentityExportContributor,
        profile: ProfileExportContributor,
        activities: ProfileActivitiesExportContributor,
        academicAffiliations: AcademicAffiliationsExportContributor,
        academicParticipations: AcademicSubjectParticipationsExportContributor,
        academicContext: AcademicCurrentContextExportContributor,
        academicFollows: AcademicFollowsExportContributor,
        authoredResources: AuthoredResourcesExportContributor,
        savedResources: SavedResourcesExportContributor,
        sharedResourceGrants: SharedResourceGrantsExportContributor,
        authoredQuestions: AuthoredQuestionsExportContributor,
        authoredAnswers: AuthoredAnswersExportContributor,
        notificationInbox: NotificationInboxExportContributor,
        organizationFollowing: OrganizationFollowingExportContributor,
        socialFollowing: SocialFollowingExportContributor,
        socialConnections: SocialConnectionsExportContributor,
      ) => [
        account,
        profile,
        activities,
        academicAffiliations,
        academicParticipations,
        academicContext,
        academicFollows,
        authoredResources,
        savedResources,
        sharedResourceGrants,
        authoredQuestions,
        authoredAnswers,
        notificationInbox,
        organizationFollowing,
        socialFollowing,
        socialConnections,
      ],
      inject: [
        AccountIdentityExportContributor,
        ProfileExportContributor,
        ProfileActivitiesExportContributor,
        AcademicAffiliationsExportContributor,
        AcademicSubjectParticipationsExportContributor,
        AcademicCurrentContextExportContributor,
        AcademicFollowsExportContributor,
        AuthoredResourcesExportContributor,
        SavedResourcesExportContributor,
        SharedResourceGrantsExportContributor,
        AuthoredQuestionsExportContributor,
        AuthoredAnswersExportContributor,
        NotificationInboxExportContributor,
        OrganizationFollowingExportContributor,
        SocialFollowingExportContributor,
        SocialConnectionsExportContributor,
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
    AccountExportAssembler,
    AccountExportContributorRegistry,
  ],
})
export class DataLifecycleModule {}
