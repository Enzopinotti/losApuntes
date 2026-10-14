import { Controller, Get, Header, Query, Req, UseGuards } from '@nestjs/common';
import type { AuthenticatedRequest } from '../auth/auth.types';
import { AuthSessionGuard } from '../auth/guards/auth-session.guard';
import { ResourceSavedSearchDto } from './dto/resource-saved-search.dto';
import { ResourceSavedSearchService } from './domain/resource-saved-search.service';

@Controller('resources/saved')
export class ResourceSavedSearchController {
  constructor(private readonly savedSearch: ResourceSavedSearchService) {}

  @UseGuards(AuthSessionGuard)
  @Get('subjects')
  @Header('Cache-Control', 'private, no-store')
  subjects(@Req() request: AuthenticatedRequest) {
    return this.savedSearch.listSubjects(request.user.id);
  }

  @UseGuards(AuthSessionGuard)
  @Get('search')
  @Header('Cache-Control', 'private, no-store')
  search(
    @Req() request: AuthenticatedRequest,
    @Query() query: ResourceSavedSearchDto,
  ) {
    return this.savedSearch.search(
      request.user.id, query.q, query.limit, query.cursor, query.subjectId, query.order,
    );
  }
}
