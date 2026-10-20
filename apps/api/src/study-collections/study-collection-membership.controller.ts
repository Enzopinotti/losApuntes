import {
  Controller,
  Get,
  Header,
  Param,
  ParseUUIDPipe,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';

import type { AuthenticatedRequest } from '../auth/auth.types';
import { AuthSessionGuard } from '../auth/guards/auth-session.guard';
import { StudyCollectionMembershipService } from './domain/study-collection-membership.service';
import { CollectionMembershipPageDto } from './dto/collection-membership.dto';
import { StudyCollectionsFeatureGuard } from './study-collections-feature.guard';

@Controller('study-collections/resources')
@UseGuards(AuthSessionGuard, StudyCollectionsFeatureGuard)
export class StudyCollectionMembershipController {
  constructor(private readonly membership: StudyCollectionMembershipService) {}

  @Get(':resourceId/membership')
  @Header('Cache-Control', 'private, no-store')
  list(
    @Req() request: AuthenticatedRequest,
    @Param('resourceId', new ParseUUIDPipe({ version: '4' }))
    resourceId: string,
    @Query() query: CollectionMembershipPageDto,
  ) {
    return this.membership.list(request.user.id, resourceId, query);
  }
}
