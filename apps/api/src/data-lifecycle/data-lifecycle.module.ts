import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';

import { AcademicModule } from '../academic/academic.module';
import { AuthModule } from '../auth/auth.module';
import { FeedsModule } from '../feeds/feeds.module';
import { FilesModule } from '../files/files.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { PilotTelemetryModule } from '../pilot/telemetry/pilot-telemetry.module';
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
import { AcademicProposalsExportContributor } from './contributors/account-export-academic-proposals.contributors';
import { PilotActivityExportContributor } from './contributors/account-export-pilot-activity.contributors';
import { FileUploadsExportContributor } from './contributors/account-export-file.contributors';
import {
  FeedFeedbackExportContributor,
  FeedPreferencesExportContributor,
} from './contributors/account-export-feed.contributors';
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
import { GoogleExternalIdentitiesExportContributor } from './contributors/account-export-google-identities.contributors';
import {
  OrganizationAuthoredEventsExportContributor,
  OrganizationAuthoredPostsExportContributor,
} from './contributors/account-export-organization-content.contributors';
import { OrganizationFollowingExportContributor } from './contributors/account-export-organization-following.contributors';
import { OrganizationManagementExportContributor } from './contributors/account-export-organization-management.contributors';
import { OrganizationSubmittedReportsExportContributor } from './contributors/account-export-organization-reports.contributors';
import {
  OrganizationAuthoredLinksExportContributor,
  OrganizationFeaturedResourcesExportContributor,
} from './contributors/account-export-organization-curation.contributors';
import {
  QaSubmittedReportsExportContributor,
  ResourceSubmittedReportsExportContributor,
} from './contributors/account-export-submitted-reports.contributors';
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
    FeedsModule,
    FilesModule,
    NotificationsModule,
    PilotTelemetryModule,
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
    AcademicProposalsExportContributor,
    FeedPreferencesExportContributor,
    FeedFeedbackExportContributor,
    FileUploadsExportContributor,
    AuthoredResourcesExportContributor,
    SavedResourcesExportContributor,
    SharedResourceGrantsExportContributor,
    AuthoredQuestionsExportContributor,
    AuthoredAnswersExportContributor,
    NotificationInboxExportContributor,
    GoogleExternalIdentitiesExportContributor,
    OrganizationAuthoredEventsExportContributor,
    OrganizationAuthoredPostsExportContributor,
    OrganizationAuthoredLinksExportContributor,
    OrganizationFeaturedResourcesExportContributor,
    OrganizationFollowingExportContributor,
    OrganizationManagementExportContributor,
    OrganizationSubmittedReportsExportContributor,
    QaSubmittedReportsExportContributor,
    ResourceSubmittedReportsExportContributor,
    SocialFollowingExportContributor,
    SocialConnectionsExportContributor,
    PilotActivityExportContributor,
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
        academicProposals: AcademicProposalsExportContributor,
        feedPreferences: FeedPreferencesExportContributor,
        feedFeedback: FeedFeedbackExportContributor,
        fileUploads: FileUploadsExportContributor,
        authoredResources: AuthoredResourcesExportContributor,
        savedResources: SavedResourcesExportContributor,
        sharedResourceGrants: SharedResourceGrantsExportContributor,
        authoredQuestions: AuthoredQuestionsExportContributor,
        authoredAnswers: AuthoredAnswersExportContributor,
        notificationInbox: NotificationInboxExportContributor,
        googleExternalIdentities: GoogleExternalIdentitiesExportContributor,
        organizationAuthoredEvents: OrganizationAuthoredEventsExportContributor,
        organizationAuthoredPosts: OrganizationAuthoredPostsExportContributor,
        organizationAuthoredLinks: OrganizationAuthoredLinksExportContributor,
        organizationFeaturedResources: OrganizationFeaturedResourcesExportContributor,
        organizationFollowing: OrganizationFollowingExportContributor,
        organizationManagement: OrganizationManagementExportContributor,
        organizationSubmittedReports: OrganizationSubmittedReportsExportContributor,
        qaSubmittedReports: QaSubmittedReportsExportContributor,
        resourceSubmittedReports: ResourceSubmittedReportsExportContributor,
        socialFollowing: SocialFollowingExportContributor,
        socialConnections: SocialConnectionsExportContributor,
        pilotActivity: PilotActivityExportContributor,
      ) => [
        account,
        profile,
        activities,
        academicAffiliations,
        academicParticipations,
        academicContext,
        academicFollows,
        academicProposals,
        feedPreferences,
        feedFeedback,
        fileUploads,
        authoredResources,
        savedResources,
        sharedResourceGrants,
        authoredQuestions,
        authoredAnswers,
        notificationInbox,
        googleExternalIdentities,
        organizationAuthoredEvents,
        organizationAuthoredPosts,
        organizationAuthoredLinks,
        organizationFeaturedResources,
        organizationFollowing,
        organizationManagement,
        organizationSubmittedReports,
        qaSubmittedReports,
        resourceSubmittedReports,
        socialFollowing,
        socialConnections,
        pilotActivity,
      ],
      inject: [
        AccountIdentityExportContributor,
        ProfileExportContributor,
        ProfileActivitiesExportContributor,
        AcademicAffiliationsExportContributor,
        AcademicSubjectParticipationsExportContributor,
        AcademicCurrentContextExportContributor,
        AcademicFollowsExportContributor,
        AcademicProposalsExportContributor,
        FeedPreferencesExportContributor,
        FeedFeedbackExportContributor,
        FileUploadsExportContributor,
        AuthoredResourcesExportContributor,
        SavedResourcesExportContributor,
        SharedResourceGrantsExportContributor,
        AuthoredQuestionsExportContributor,
        AuthoredAnswersExportContributor,
        NotificationInboxExportContributor,
        GoogleExternalIdentitiesExportContributor,
        OrganizationAuthoredEventsExportContributor,
        OrganizationAuthoredPostsExportContributor,
        OrganizationAuthoredLinksExportContributor,
        OrganizationFeaturedResourcesExportContributor,
        OrganizationFollowingExportContributor,
        OrganizationManagementExportContributor,
        OrganizationSubmittedReportsExportContributor,
        QaSubmittedReportsExportContributor,
        ResourceSubmittedReportsExportContributor,
        SocialFollowingExportContributor,
        SocialConnectionsExportContributor,
        PilotActivityExportContributor,
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
