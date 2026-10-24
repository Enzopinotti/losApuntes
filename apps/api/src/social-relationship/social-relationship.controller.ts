import {
  Controller,
  Get,
  Header,
  Param,
  ParseUUIDPipe,
  Req,
  UseGuards,
} from '@nestjs/common';

import type { AuthenticatedRequest } from '../auth/auth.types';
import { AuthSessionGuard } from '../auth/guards/auth-session.guard';
import { SocialRelationshipService } from './social-relationship.service';

@Controller('social/profiles')
@UseGuards(AuthSessionGuard)
export class SocialRelationshipController {
  constructor(private readonly relationships: SocialRelationshipService) {}

  @Get(':profileId/relationship')
  @Header('Cache-Control', 'private, no-store')
  get(
    @Req() request: AuthenticatedRequest,
    @Param('profileId', new ParseUUIDPipe({ version: '4' }))
    profileId: string,
  ) {
    return this.relationships.get(request.user.id, profileId);
  }
}
