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

import type { AuthenticatedRequest } from '../auth/auth.types';
import { AuthSessionGuard } from '../auth/guards/auth-session.guard';
import { StudyCollectionsFeatureGuard } from './study-collections-feature.guard';
import {
  CreateStudyCollectionDto,
  RemoveStudyCollectionResourceDto,
  StudyCollectionListDto,
  UpdateStudyCollectionDto,
} from './dto/study-collection.dto';
import { StudyCollectionService } from './domain/study-collection.service';

@Controller('study-collections')
@UseGuards(AuthSessionGuard, StudyCollectionsFeatureGuard)
export class StudyCollectionsController {
  constructor(private readonly collections: StudyCollectionService) {}

  @Post()
  @Header('Cache-Control', 'private, no-store')
  create(
    @Req() request: AuthenticatedRequest,
    @Body() dto: CreateStudyCollectionDto,
  ) {
    return this.collections.create(request.user.id, dto);
  }

  @Get()
  @Header('Cache-Control', 'private, no-store')
  list(
    @Req() request: AuthenticatedRequest,
    @Query() query: StudyCollectionListDto,
  ) {
    return this.collections.list(request.user.id, query.limit, query.cursor);
  }

  @Get(':id')
  @Header('Cache-Control', 'private, no-store')
  get(
    @Req() request: AuthenticatedRequest,
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
  ) {
    return this.collections.get(request.user.id, id);
  }

  @Patch(':id')
  @Header('Cache-Control', 'private, no-store')
  update(
    @Req() request: AuthenticatedRequest,
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Body() dto: UpdateStudyCollectionDto,
  ) {
    return this.collections.update(request.user.id, id, dto);
  }

  @Delete(':id')
  @Header('Cache-Control', 'private, no-store')
  delete(
    @Req() request: AuthenticatedRequest,
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
  ) {
    return this.collections.delete(request.user.id, id);
  }

  @Get(':id/resources')
  @Header('Cache-Control', 'private, no-store')
  resources(
    @Req() request: AuthenticatedRequest,
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Query() query: StudyCollectionListDto,
  ) {
    return this.collections.listResources(
      request.user.id,
      id,
      query.limit,
      query.cursor,
    );
  }

  @Put(':id/resources/:resourceId')
  @Header('Cache-Control', 'private, no-store')
  addResource(
    @Req() request: AuthenticatedRequest,
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Param('resourceId', new ParseUUIDPipe({ version: '4' }))
    resourceId: string,
  ) {
    return this.collections.addResource(request.user.id, id, resourceId);
  }

  @Delete(':id/resources/:resourceId')
  @Header('Cache-Control', 'private, no-store')
  removeResource(
    @Req() request: AuthenticatedRequest,
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Param('resourceId', new ParseUUIDPipe({ version: '4' }))
    resourceId: string,
    @Query() query: RemoveStudyCollectionResourceDto,
  ) {
    return this.collections.removeResource(
      request.user.id,
      id,
      resourceId,
      query.expectedRevision,
    );
  }
}
