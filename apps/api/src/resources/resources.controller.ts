import {
  Body,
  Controller,
  Delete,
  Get,
  Header,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';

import type {
  AuthenticatedRequest,
  OptionallyAuthenticatedRequest,
} from '../auth/auth.types';
import { AuthSessionGuard } from '../auth/guards/auth-session.guard';
import { OptionalAuthSessionGuard } from '../auth/guards/optional-auth-session.guard';
import { VerifiedEmailGuard } from '../auth/guards/verified-email.guard';
import {
  CreateResourceDto,
  CreateResourceReportDto,
  ResourceAccessDto,
  ResourceSavedListDto,
  ResourceOwnedListDto,
  ResourceSearchDto,
  ResourceShareListDto,
  UpdateResourceDto,
} from './dto/resource.dto';
import { ResourceService } from './domain/resource.service';

@Controller('resources')
export class ResourcesController {
  constructor(private readonly resources: ResourceService) {}

  @UseGuards(OptionalAuthSessionGuard)
  @Get()
  search(
    @Req() request: OptionallyAuthenticatedRequest,
    @Query() query: ResourceSearchDto,
  ) {
    return this.resources.search(request.user?.id, query);
  }

  @UseGuards(AuthSessionGuard, VerifiedEmailGuard)
  @Get('mine/stats')
  @Header('Cache-Control', 'private, no-store')
  ownedStatistics(@Req() request: AuthenticatedRequest) {
    return this.resources.getOwnedStatistics(request.user.id);
  }

  @UseGuards(AuthSessionGuard, VerifiedEmailGuard)
  @Get('mine/subjects')
  @Header('Cache-Control', 'private, no-store')
  ownedSubjects(@Req() request: AuthenticatedRequest) {
    return this.resources.listOwnedSubjects(request.user.id);
  }

  @UseGuards(AuthSessionGuard, VerifiedEmailGuard)
  @Get('mine')
  @Header('Cache-Control', 'private, no-store')
  mine(
    @Req() request: AuthenticatedRequest,
    @Query() query: ResourceOwnedListDto,
  ) {
    return this.resources.listOwned(request.user.id, {
      limit: query.limit,
      ...(query.visibility ? { visibility: query.visibility } : {}),
      ...(query.q ? { q: query.q } : {}),
      ...(query.subjectId ? { subjectId: query.subjectId } : {}),
      ...(query.order ? { order: query.order } : {}),
      ...(query.cursor ? { cursor: query.cursor } : {}),
    });
  }

  @UseGuards(AuthSessionGuard)
  @Get('saved')
  @Header('Cache-Control', 'private, no-store')
  saved(
    @Req() request: AuthenticatedRequest,
    @Query() query: ResourceSavedListDto,
  ) {
    return this.resources.listSaved(request.user.id, query.limit, query.cursor, query.q);
  }

  @UseGuards(OptionalAuthSessionGuard)
  @Get(':id')
  get(
    @Req() request: OptionallyAuthenticatedRequest,
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
  ) {
    return this.resources.get(id, request.user?.id);
  }

  @UseGuards(AuthSessionGuard, VerifiedEmailGuard)
  @Post()
  create(@Req() request: AuthenticatedRequest, @Body() dto: CreateResourceDto) {
    return this.resources.create(request.user.id, dto);
  }

  @UseGuards(AuthSessionGuard, VerifiedEmailGuard)
  @Patch(':id')
  update(
    @Req() request: AuthenticatedRequest,
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Body() dto: UpdateResourceDto,
  ) {
    return this.resources.update(request.user.id, id, dto);
  }

  @UseGuards(AuthSessionGuard, VerifiedEmailGuard)
  @Post(':id/access')
  @Header('Cache-Control', 'no-store')
  access(
    @Req() request: AuthenticatedRequest,
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Body() dto: ResourceAccessDto,
  ) {
    return this.resources.createAccessIntent(
      request.user.id,
      id,
      dto.disposition,
    );
  }

  @UseGuards(AuthSessionGuard, VerifiedEmailGuard)
  @Get(':id/shares')
  @Header('Cache-Control', 'private, no-store')
  shares(
    @Req() request: AuthenticatedRequest,
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Query() query: ResourceShareListDto,
  ) {
    return this.resources.listShareGrants(
      request.user.id,
      id,
      query.limit,
      query.cursor,
    );
  }

  @UseGuards(AuthSessionGuard, VerifiedEmailGuard)
  @Put(':id/shares/:profileId')
  share(
    @Req() request: AuthenticatedRequest,
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Param('profileId', new ParseUUIDPipe({ version: '4' })) profileId: string,
  ) {
    return this.resources.grantShare(request.user.id, id, profileId);
  }

  @UseGuards(AuthSessionGuard, VerifiedEmailGuard)
  @Delete(':id/shares/:profileId')
  async unshare(
    @Req() request: AuthenticatedRequest,
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Param('profileId', new ParseUUIDPipe({ version: '4' })) profileId: string,
  ): Promise<void> {
    await this.resources.revokeShare(request.user.id, id, profileId);
  }

  @UseGuards(AuthSessionGuard)
  @Put(':id/save')
  save(
    @Req() request: AuthenticatedRequest,
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
  ) {
    return this.resources.save(request.user.id, id);
  }

  @UseGuards(AuthSessionGuard)
  @Delete(':id/save')
  async unsave(
    @Req() request: AuthenticatedRequest,
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
  ): Promise<void> {
    await this.resources.unsave(request.user.id, id);
  }

  @UseGuards(AuthSessionGuard)
  @Post(':id/reports')
  report(
    @Req() request: AuthenticatedRequest,
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Body() dto: CreateResourceReportDto,
  ) {
    return this.resources.report(request.user.id, id, dto.reason, dto.details);
  }
}
