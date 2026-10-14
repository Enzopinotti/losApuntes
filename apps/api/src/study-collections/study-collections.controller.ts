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
import {
  CreateStudyCollectionDto,
  StudyCollectionListDto,
  UpdateStudyCollectionDto,
} from './dto/study-collection.dto';
import { StudyCollectionService } from './domain/study-collection.service';

@Controller('study-collections')
@UseGuards(AuthSessionGuard)
@Header('Cache-Control', 'private, no-store')
export class StudyCollectionsController {
  constructor(private readonly collections: StudyCollectionService) {}

  @Post()
  create(
    @Req() request: AuthenticatedRequest,
    @Body() dto: CreateStudyCollectionDto,
  ) {
    return this.collections.create(request.user.id, dto);
  }

  @Get()
  list(
    @Req() request: AuthenticatedRequest,
    @Query() query: StudyCollectionListDto,
  ) {
    return this.collections.list(request.user.id, query.limit, query.cursor);
  }

  @Get(':id')
  get(
    @Req() request: AuthenticatedRequest,
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
  ) {
    return this.collections.get(request.user.id, id);
  }

  @Patch(':id')
  update(
    @Req() request: AuthenticatedRequest,
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Body() dto: UpdateStudyCollectionDto,
  ) {
    return this.collections.update(request.user.id, id, dto);
  }

  @Delete(':id')
  delete(
    @Req() request: AuthenticatedRequest,
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
  ) {
    return this.collections.delete(request.user.id, id);
  }

  @Get(':id/resources')
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
  addResource(
    @Req() request: AuthenticatedRequest,
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Param('resourceId', new ParseUUIDPipe({ version: '4' })) resourceId: string,
  ) {
    return this.collections.addResource(request.user.id, id, resourceId);
  }

  @Delete(':id/resources/:resourceId')
  removeResource(
    @Req() request: AuthenticatedRequest,
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Param('resourceId', new ParseUUIDPipe({ version: '4' })) resourceId: string,
  ) {
    return this.collections.removeResource(request.user.id, id, resourceId);
  }
}
