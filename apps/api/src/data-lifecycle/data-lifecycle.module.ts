import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
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
import { StudyCollectionsExportReadModule } from '../study-collections/mongo/study-collections-export-read.module';
import { StudyProgressExportReadModule } from '../study-progress/mongo/study-progress-export-read.module';
import {
  StudyCollection,
  StudyCollectionSchema,
} from '../study-collections/mongo/study-collection.mongo-schema';
import {
  StudyProgress,
  StudyProgressSchema,
} from '../study-progress/mongo/study-progress.schema';
import { Profile, ProfileSchema } from '../profile/mongo/profile.mongo-schemas';
import { User, UserSchema } from '../users/schemas/user.schema';
import { UsersModule } from '../users/users.module';
import { AccountLifecycleController } from './account-lifecycle.controller';
import { AccountExportController } from './account-export.controller';
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
import { StudyCollectionsExportContributor } from './contributors/account-export-study-collections.contributor';
import { StudyProgressExportContributor } from './contributors/account-export-study-progress.contributor';
import { AccountExportAssembler } from './domain/account-export-assembler';
import {
  ACCOUNT_EXPORT_CONTRIBUTORS,
  AccountExportContributorRegistry,
  assertAccountExportSections,
} from './domain/account-export-contributor.registry';
import { AccountExportService } from './domain/account-export.service';
import { AccountExportProcessor } from './domain/account-export-processor';
import { ACCOUNT_EXPORT_STORE } from './domain/account-export.store';
import {
  ACCOUNT_EXPORT_ARTIFACT_STORAGE,
  S3AccountExportArtifactStorage,
} from './storage/account-export-artifact-storage';
import { createS3ObjectStorage } from '../files/storage/s3-object-storage';
import { requireConfigString } from '../config/required-config';
import { AccountLifecycleService } from './domain/account-lifecycle.service';
import { ACCOUNT_LIFECYCLE_STORE } from './domain/account-lifecycle.store';
import {
  AccountExportJob,
  AccountExportJobSchema,
} from './mongo/account-export.mongo-schema';
import { MongoAccountExportStore } from './mongo/mongo-account-export.store';
import { ACCOUNT_EXPORT_ORPHAN_CLEANUP_STORE } from './domain/account-export-orphan-cleanup.store';
import {
  AccountExportOrphanCleanup,
  AccountExportOrphanCleanupSchema,
} from './mongo/account-export-orphan-cleanup.schema';
import { MongoAccountExportOrphanCleanupStore } from './mongo/mongo-account-export-orphan-cleanup.store';
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
    StudyCollectionsExportReadModule,
    StudyProgressExportReadModule,
    MongooseModule.forFeature([
      { name: User.name, schema: UserSchema },
      { name: Profile.name, schema: ProfileSchema },
      { name: OrganizationManager.name, schema: OrganizationManagerSchema },
      { name: AccountOffboardingJob.name, schema: AccountOffboardingJobSchema },
      { name: AccountExportJob.name, schema: AccountExportJobSchema },
      {
        name: AccountExportOrphanCleanup.name,
        schema: AccountExportOrphanCleanupSchema,
      },
      { name: SecurityAudit.name, schema: SecurityAuditSchema },
      { name: StudyCollection.name, schema: StudyCollectionSchema },
      { name: StudyProgress.name, schema: StudyProgressSchema },
    ]),
  ],
  controllers: [AccountLifecycleController, AccountExportController],
  providers: [
    AccountLifecycleService,
    AccountExportService,
    AccountExportAssembler,
    AccountExportProcessor,
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
    StudyCollectionsExportContributor,
    StudyProgressExportContributor,
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
        studyCollections: StudyCollectionsExportContributor,
        studyProgress: StudyProgressExportContributor,
      ) => {
        const contributors = [
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
          studyCollections,
          studyProgress,
        ];
        assertAccountExportSections(contributors, 3);
        return contributors;
      },
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
        StudyCollectionsExportContributor,
        StudyProgressExportContributor,
      ],
    },
    AccountExportContributorRegistry,
    MongoAccountLifecycleStore,
    MongoAccountExportStore,
    MongoAccountExportOrphanCleanupStore,
    {
      provide: ACCOUNT_EXPORT_ORPHAN_CLEANUP_STORE,
      useExisting: MongoAccountExportOrphanCleanupStore,
    },
    {
      provide: ACCOUNT_LIFECYCLE_STORE,
      useExisting: MongoAccountLifecycleStore,
    },
    {
      provide: ACCOUNT_EXPORT_STORE,
      useExisting: MongoAccountExportStore,
    },
    {
      provide: ACCOUNT_EXPORT_ARTIFACT_STORAGE,
      inject: [ConfigService],
      useFactory: (config: ConfigService) =>
        new S3AccountExportArtifactStorage(
          createS3ObjectStorage({
            endpoint: requireConfigString(config, 'FILES_S3_ENDPOINT'),
            region: requireConfigString(config, 'FILES_S3_REGION'),
            bucket: requireConfigString(config, 'ACCOUNT_EXPORT_S3_BUCKET'),
            accessKeyId: requireConfigString(
              config,
              'ACCOUNT_EXPORT_S3_ACCESS_KEY_ID',
            ),
            secretAccessKey: requireConfigString(
              config,
              'ACCOUNT_EXPORT_S3_SECRET_ACCESS_KEY',
            ),
            providerId: 's3',
            configurationPrefix: 'ACCOUNT_EXPORT_S3',
          }),
        ),
    },
  ],
  exports: [
    AccountLifecycleService,
    AccountExportService,
    AccountExportAssembler,
    AccountExportContributorRegistry,
    ACCOUNT_EXPORT_ARTIFACT_STORAGE,
  ],
})
export class DataLifecycleModule {}
