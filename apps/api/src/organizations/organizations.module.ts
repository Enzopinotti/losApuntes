import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';

import { AcademicModule } from '../academic/academic.module';
import { AuthModule } from '../auth/auth.module';
import { ProfileModule } from '../profile/profile.module';
import { ResourcesModule } from '../resources/resources.module';
import { UsersModule } from '../users/users.module';
import { OrganizationService } from './domain/organization.service';
import { ORGANIZATION_STORE } from './domain/organization.store';
import { OrganizationsVerifyGuard } from './guards/organizations-verify.guard';
import { MongoOrganizationStore } from './mongo/mongo-organization.store';
import {
  Organization,
  OrganizationAudit,
  OrganizationAuditSchema,
  OrganizationEvent,
  OrganizationEventSchema,
  OrganizationFeaturedResource,
  OrganizationFeaturedResourceSchema,
  OrganizationFollow,
  OrganizationFollowSchema,
  OrganizationLink,
  OrganizationLinkSchema,
  OrganizationManager,
  OrganizationManagerSchema,
  OrganizationPost,
  OrganizationPostSchema,
  OrganizationReport,
  OrganizationReportSchema,
  OrganizationSchema,
} from './mongo/organization.mongo-schemas';
import { OrganizationsController } from './organizations.controller';

@Module({
  imports: [
    AuthModule,
    UsersModule,
    AcademicModule,
    ProfileModule,
    ResourcesModule,
    MongooseModule.forFeature([
      { name: Organization.name, schema: OrganizationSchema },
      { name: OrganizationManager.name, schema: OrganizationManagerSchema },
      { name: OrganizationAudit.name, schema: OrganizationAuditSchema },
      { name: OrganizationFollow.name, schema: OrganizationFollowSchema },
      { name: OrganizationPost.name, schema: OrganizationPostSchema },
      { name: OrganizationEvent.name, schema: OrganizationEventSchema },
      { name: OrganizationReport.name, schema: OrganizationReportSchema },
      { name: OrganizationLink.name, schema: OrganizationLinkSchema },
      {
        name: OrganizationFeaturedResource.name,
        schema: OrganizationFeaturedResourceSchema,
      },
    ]),
  ],
  providers: [
    OrganizationService,
    OrganizationsVerifyGuard,
    MongoOrganizationStore,
    {
      provide: ORGANIZATION_STORE,
      useExisting: MongoOrganizationStore,
    },
  ],
  controllers: [OrganizationsController],
  exports: [OrganizationService],
})
export class OrganizationsModule {}
