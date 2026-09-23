import { Controller, Get, Query, Req, UseGuards } from '@nestjs/common';

import type {
  AuthenticatedRequest,
  OptionallyAuthenticatedRequest,
} from '../auth/auth.types';
import { AuthSessionGuard } from '../auth/guards/auth-session.guard';
import { OptionalAuthSessionGuard } from '../auth/guards/optional-auth-session.guard';
import {
  ContextualDiscoveryQueryDto,
  SearchQueryDto,
} from './dto/search.dto';
import { SearchDiscoveryService } from './domain/search-discovery.service';

@Controller()
export class SearchDiscoveryController {
  constructor(private readonly searchDiscovery: SearchDiscoveryService) {}

  @UseGuards(OptionalAuthSessionGuard)
  @Get('search')
  search(
    @Req() request: OptionallyAuthenticatedRequest,
    @Query() query: SearchQueryDto,
  ) {
    return this.searchDiscovery.search(request.user?.id, query);
  }

  @UseGuards(AuthSessionGuard)
  @Get('discovery/contextual')
  contextual(
    @Req() request: AuthenticatedRequest,
    @Query() query: ContextualDiscoveryQueryDto,
  ) {
    return this.searchDiscovery.contextual(request.user.id, query);
  }
}
