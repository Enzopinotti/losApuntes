import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';

import { AuthModule } from '../auth/auth.module';
import { UsersModule } from '../users/users.module';
import { AcademicController } from './academic.controller';
import { AcademicService } from './domain/academic.service';
import { ACADEMIC_STORE } from './domain/academic.store';
import { AcademicAdminGuard } from './guards/academic-admin.guard';
import {
  AcademicAffiliation,
  AcademicAffiliationSchema,
  AcademicAuditEvent,
  AcademicAuditEventSchema,
  AcademicCatalogNode,
  AcademicCatalogNodeSchema,
  AcademicCatalogProposal,
  AcademicCatalogProposalSchema,
  AcademicCurrentContext,
  AcademicCurrentContextSchema,
  AcademicSubjectParticipation,
  AcademicSubjectParticipationSchema,
} from './mongo/academic.mongo-schemas';
import { MongoAcademicStore } from './mongo/mongo-academic.store';

@Module({
  imports: [
    AuthModule,
    UsersModule,
    MongooseModule.forFeature([
      { name: AcademicCatalogNode.name, schema: AcademicCatalogNodeSchema },
      { name: AcademicAffiliation.name, schema: AcademicAffiliationSchema },
      {
        name: AcademicSubjectParticipation.name,
        schema: AcademicSubjectParticipationSchema,
      },
      {
        name: AcademicCurrentContext.name,
        schema: AcademicCurrentContextSchema,
      },
      {
        name: AcademicCatalogProposal.name,
        schema: AcademicCatalogProposalSchema,
      },
      { name: AcademicAuditEvent.name, schema: AcademicAuditEventSchema },
    ]),
  ],
  providers: [
    AcademicService,
    AcademicAdminGuard,
    MongoAcademicStore,
    {
      provide: ACADEMIC_STORE,
      useExisting: MongoAcademicStore,
    },
  ],
  controllers: [AcademicController],
  exports: [AcademicService],
})
export class AcademicModule {}
