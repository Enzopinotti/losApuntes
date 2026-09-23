import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';

import type { AuthenticatedRequest } from '../auth/auth.types';
import { AuthSessionGuard } from '../auth/guards/auth-session.guard';
import { AcademicService } from './domain/academic.service';
import {
  AcademicCatalogChildrenDto,
  AcademicCatalogSearchDto,
  CreateAcademicAffiliationDto,
  CreateAcademicCatalogNodeDto,
  CreateAcademicProposalDto,
  MergeAcademicCatalogNodeDto,
  SetAcademicContextDto,
  UpdateAcademicAffiliationStatusDto,
  UpdateAcademicCatalogNodeDto,
  UpsertSubjectParticipationDto,
} from './dto/academic.dto';
import { AcademicAdminGuard } from './guards/academic-admin.guard';

@Controller('academic')
export class AcademicController {
  constructor(private readonly academic: AcademicService) {}

  @Get('catalog/search')
  search(@Query() query: AcademicCatalogSearchDto) {
    return this.academic.searchCatalog(query);
  }

  @Get('catalog/:id/children')
  children(
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Query() query: AcademicCatalogChildrenDto,
  ) {
    return this.academic.listChildren(id, query.kind, query.limit);
  }

  @Get('catalog/:id')
  get(@Param('id', new ParseUUIDPipe({ version: '4' })) id: string) {
    return this.academic.getCatalogNode(id);
  }

  @UseGuards(AuthSessionGuard)
  @Get('me/affiliations')
  affiliations(@Req() request: AuthenticatedRequest) {
    return this.academic.listAffiliations(request.user.id);
  }

  @UseGuards(AuthSessionGuard)
  @Post('me/affiliations')
  createAffiliation(
    @Req() request: AuthenticatedRequest,
    @Body() dto: CreateAcademicAffiliationDto,
  ) {
    return this.academic.createAffiliation(request.user.id, dto);
  }

  @UseGuards(AuthSessionGuard)
  @Patch('me/affiliations/:id/status')
  updateAffiliationStatus(
    @Req() request: AuthenticatedRequest,
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Body() dto: UpdateAcademicAffiliationStatusDto,
  ) {
    return this.academic.updateAffiliationStatus(request.user.id, id, dto);
  }

  @UseGuards(AuthSessionGuard)
  @Get('me/subjects')
  subjects(@Req() request: AuthenticatedRequest) {
    return this.academic.listSubjectParticipations(request.user.id);
  }

  @UseGuards(AuthSessionGuard)
  @Put('me/subjects/:subjectId')
  subjectParticipation(
    @Req() request: AuthenticatedRequest,
    @Param('subjectId', new ParseUUIDPipe({ version: '4' })) subjectId: string,
    @Body() dto: UpsertSubjectParticipationDto,
  ) {
    return this.academic.upsertSubjectParticipation(
      request.user.id,
      subjectId,
      dto,
    );
  }

  @UseGuards(AuthSessionGuard)
  @Get('me/context')
  context(@Req() request: AuthenticatedRequest) {
    return this.academic.getCurrentContext(request.user.id);
  }

  @UseGuards(AuthSessionGuard)
  @Put('me/context')
  setContext(
    @Req() request: AuthenticatedRequest,
    @Body() dto: SetAcademicContextDto,
  ) {
    return this.academic.setCurrentContext(request.user.id, dto);
  }

  @UseGuards(AuthSessionGuard)
  @Post('proposals')
  createProposal(
    @Req() request: AuthenticatedRequest,
    @Body() dto: CreateAcademicProposalDto,
  ) {
    return this.academic.createProposal(request.user.id, dto);
  }

  @UseGuards(AuthSessionGuard, AcademicAdminGuard)
  @Post('admin/catalog')
  createCatalogNode(
    @Req() request: AuthenticatedRequest,
    @Body() dto: CreateAcademicCatalogNodeDto,
  ) {
    return this.academic.createCatalogNode(request.user.id, dto);
  }

  @UseGuards(AuthSessionGuard, AcademicAdminGuard)
  @Patch('admin/catalog/:id')
  updateCatalogNode(
    @Req() request: AuthenticatedRequest,
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Body() dto: UpdateAcademicCatalogNodeDto,
  ) {
    return this.academic.updateCatalogNode(request.user.id, id, dto);
  }

  @UseGuards(AuthSessionGuard, AcademicAdminGuard)
  @Post('admin/catalog/:id/merge')
  mergeCatalogNode(
    @Req() request: AuthenticatedRequest,
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Body() dto: MergeAcademicCatalogNodeDto,
  ) {
    return this.academic.mergeCatalogNode(
      request.user.id,
      id,
      dto.targetId,
      dto.expectedRevision,
    );
  }
}
